/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { CompressionProps } from '../../types.js';
import Spinner from 'ink-spinner';
import { Colors } from '../../colors.js';

export interface CompressionDisplayProps {
  compression: CompressionProps;
}

/*
 * Compression messages appear when the /compress command is run, and show a loading spinner
 * while compression is in progress, followed up by some compression stats.
 */
export const CompressionMessage: React.FC<CompressionDisplayProps> = ({
  compression,
}) => {
  const text = compression.isPending
    ? 'Compressing chat history'
    : `Chat history compressed from ${compression.originalTokenCount ?? 'unknown'}` +
      ` to ${compression.newTokenCount ?? 'unknown'} tokens.`;

  return (
    <Box flexDirection="row">
      <Box marginRight={1}>
        {compression.isPending ? (
          <Spinner type="dots" />
        ) : (
          <Text color={Colors.AccentPurple}>✦</Text>
        )}
      </Box>
      <Box>
        <Text
          color={
            compression.isPending ? Colors.AccentPurple : Colors.AccentGreen
          }
        >
          {text}
        </Text>
      </Box>
    </Box>
  );
};
