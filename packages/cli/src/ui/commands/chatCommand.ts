/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fsPromises from 'fs/promises';
import { CommandContext, SlashCommand, MessageActionReturn } from './types.js';
import path from 'path';
import { HistoryItemWithoutId, MessageType } from '../types.js';

interface ChatDetail {
  name: string;
  mtime: Date;
}

const getSavedChatTags = async (
  context: CommandContext,
  mtSortDesc: boolean,
): Promise<ChatDetail[]> => {
  const geminiDir = context.services.config?.getProjectTempDir();
  if (!geminiDir) {
    return [];
  }
  try {
    const file_head = 'checkpoint-';
    const file_tail = '.json';
    const files = await fsPromises.readdir(geminiDir);
    const chatDetails: Array<{ name: string; mtime: Date }> = [];

    for (const file of files) {
      if (file.startsWith(file_head) && file.endsWith(file_tail)) {
        const filePath = path.join(geminiDir, file);
        const stats = await fsPromises.stat(filePath);
        chatDetails.push({
          name: file.slice(file_head.length, -file_tail.length),
          mtime: stats.mtime,
        });
      }
    }

    chatDetails.sort((a, b) =>
      mtSortDesc
        ? b.mtime.getTime() - a.mtime.getTime()
        : a.mtime.getTime() - b.mtime.getTime(),
    );

    return chatDetails;
  } catch (_err) {
    return [];
  }
};

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List saved conversation checkpoints',
  action: async (context): Promise<MessageActionReturn> => {
    const chatDetails = await getSavedChatTags(context, false);
    if (chatDetails.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No saved conversation checkpoints found.',
      };
    }

    let message = 'List of saved conversations:\n\n';
    for (const chat of chatDetails) {
      message += `  - \u001b[36m${chat.name}\u001b[0m\n`;
    }
    message += `\n\u001b[90mNote: Newest last, oldest first\u001b[0m`;
    return {
      type: 'message',
      messageType: 'info',
      content: message,
    };
  },
};

const saveCommand: SlashCommand = {
  name: 'save',
  description:
    'Save the current conversation as a checkpoint. Usage: /chat save <tag>',
  action: async (context, args): Promise<MessageActionReturn> => {
    const tag = args.trim();
    if (!tag) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing tag. Usage: /chat save <tag>',
      };
    }

    const { logger, config } = context.services;
    await logger.initialize();
    const chat = await config?.getGeminiClient()?.getChat();
    if (!chat) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No chat client available to save conversation.',
      };
    }

    const history = chat.getHistory();
    if (history.length > 0) {
      await logger.saveCheckpoint(history, tag);
      return {
        type: 'message',
        messageType: 'info',
        content: `Conversation checkpoint saved with tag: ${tag}.`,
      };
    } else {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No conversation found to save.',
      };
    }
  },
};

const resumeCommand: SlashCommand = {
  name: 'resume',
  altName: 'load',
  description:
    'Resume a conversation from a checkpoint. Usage: /chat resume <tag>',
  action: async (context, args) => {
    const tag = args.trim();
    if (!tag) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing tag. Usage: /chat resume <tag>',
      };
    }

    const { logger } = context.services;
    await logger.initialize();
    const conversation = await logger.loadCheckpoint(tag);

    if (conversation.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: `No saved checkpoint found with tag: ${tag}.`,
      };
    }

    const rolemap: { [key: string]: MessageType } = {
      user: MessageType.USER,
      model: MessageType.GEMINI,
    };

    const uiHistory: HistoryItemWithoutId[] = [];
    let hasSystemPrompt = false;
    let i = 0;

    for (const item of conversation) {
      i += 1;
      const text =
        item.parts
          ?.filter((m) => !!m.text)
          .map((m) => m.text)
          .join('') || '';
      if (!text) {
        continue;
      }
      if (i === 1 && text.match(/context for our chat/)) {
        hasSystemPrompt = true;
      }
      if (i > 2 || !hasSystemPrompt) {
        uiHistory.push({
          type: (item.role && rolemap[item.role]) || MessageType.GEMINI,
          text,
        } as HistoryItemWithoutId);
      }
    }
    return {
      type: 'load_history',
      history: uiHistory,
      clientHistory: conversation,
    };
  },
  completion: async (context, partialArg) => {
    const chatDetails = await getSavedChatTags(context, true);
    return chatDetails
      .map((chat) => chat.name)
      .filter((name) => name.startsWith(partialArg));
  },
};

export const chatCommand: SlashCommand = {
  name: 'chat',
  description: 'Manage conversation history.',
  subCommands: [listCommand, saveCommand, resumeCommand],
};
