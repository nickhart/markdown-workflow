/**
 * Emoji processor
 * Converts emoji shortcodes like :rocket: to Unicode emoji 🚀
 *
 * Uses GitHub's standard emoji shortcode names as the primary mapping,
 * with additional convenient aliases for frequently used emojis.
 *
 * Standard names source: https://api.github.com/emojis
 */

import * as fs from 'fs';
import {
  BaseProcessor,
  ProcessorBlock,
  ProcessingContext,
  ProcessingResult,
} from './base-processor.js';

// GitHub standard emoji mappings with convenient aliases
// Priority: GitHub standard names first, then convenient aliases for frequently used emojis
const EMOJI_MAP: Record<string, string> = {
  // === BASIC EMOJI (GitHub standard) ===
  ':rocket:': '🚀',
  ':star:': '⭐',
  ':fire:': '🔥',
  ':heart:': '❤️',
  ':thumbsup:': '👍',
  ':thumbsdown:': '👎',
  ':warning:': '⚠️',
  ':information_source:': 'ℹ️',
  ':gear:': '⚙️',

  // === CONVENIENT ALIASES ===
  ':thumbs_up:': '👍', // alias for :thumbsup:
  ':thumbs_down:': '👎', // alias for :thumbsdown:
  ':info:': 'ℹ️', // alias for :information_source:
  ':check:': '✅',
  ':white_check_mark:': '✅',
  ':x:': '❌',
  ':lightbulb:': '💡',
  ':folder:': '📂',
  ':file:': '📄',
  ':link:': '🔗',
  ':key:': '🔑',
  ':lock:': '🔒',
  ':unlock:': '🔓',
  ':search:': '🔍',
  ':clock:': '🕐',
  ':calendar:': '📅',
  ':email:': '📧',
  ':phone:': '📞',
  ':computer:': '💻',
  ':mobile:': '📱',
  ':cloud:': '☁️',
  ':sun:': '☀️',
  ':moon:': '🌙',
  ':earth:': '🌍',
  ':tree:': '🌳',
  ':hammer:': '🔨',
  ':wrench:': '🔧',
  ':scissors:': '✂️',
  ':pencil:': '✏️',
  ':paintbrush:': '🖌️',
  ':art:': '🎨',
  ':music:': '🎵',
  ':camera:': '📷',
  ':video:': '📹',
  ':game:': '🎮',
  ':gift:': '🎁',
  ':trophy:': '🏆',
  ':medal:': '🏅',
  ':flag:': '🚩',
  ':bookmark:': '🔖',
  ':tag:': '🏷️',
  ':package:': '📦',
  ':box:': '📦',
  ':truck:': '🚚',
  ':car:': '🚗',
  ':plane:': '✈️',
  ':ship:': '🚢',
  ':train:': '🚄',
  ':house:': '🏠',
  ':office:': '🏢',
  ':school:': '🏫',
  ':hospital:': '🏥',
  ':bank:': '🏦',
  ':store:': '🏪',
  ':restaurant:': '🍽️',
  ':pizza:': '🍕',
  ':takeout_box:': '🥡',
  ':coffee:': '☕',
  ':beer:': '🍺',
  ':wine:': '🍷',
  ':cake:': '🎂',
  ':apple:': '🍎',
  ':banana:': '🍌',
  ':grapes:': '🍇',
  ':bread:': '🍞',
  ':cheese:': '🧀',
  ':egg:': '🥚',
  ':fish:': '🐟',
  ':chicken:': '🐔',
  ':cow:': '🐄',
  ':pig:': '🐷',
  ':dog:': '🐕',
  ':cat:': '🐱',
  ':mouse:': '🐭',
  ':rabbit:': '🐰',
  ':bear:': '🐻',
  ':panda:': '🐼',
  ':lion:': '🦁',
  ':tiger:': '🐅',
  ':elephant:': '🐘',
  ':monkey:': '🐵',
  ':bird:': '🐦',
  ':penguin:': '🐧',
  ':snake:': '🐍',
  ':turtle:': '🐢',
  ':frog:': '🐸',
  ':octopus:': '🐙',
  ':butterfly:': '🦋',
  ':flower:': '🌸',
  ':rose:': '🌹',
  ':sunflower:': '🌻',
  ':rainbow:': '🌈',
  ':snowflake:': '❄️',
  ':zap:': '⚡',
  ':boom:': '💥',
  ':sparkles:': '✨',
  ':dizzy:': '💫',
  ':crown:': '👑',
  ':ring:': '💍',
  ':gem:': '💎',
  ':money:': '💰',
  ':dollar:': '💵',
  ':euro:': '💶',
  ':yen:': '💴',
  ':credit_card:': '💳',
  ':chart:': '📊',
  ':graph:': '📈',
  ':clipboard:': '📋',
  ':newspaper:': '📰',
  ':book:': '📚',
  ':notebook:': '📓',
  ':page:': '📃',
  ':scroll:': '📜',
  ':memo:': '📝',
  ':pushpin:': '📌',
  ':round_pushpin:': '📍',
  ':triangular_flag:': '🚩',
  ':crossed_flags:': '🎌',
  ':waving_flag:': '🏴',
  ':pirate_flag:': '🏴‍☠️',
  ':bust_in_silhouette:': '👤',
  ':speech_balloon:': '💬',
  ':world:': '🌍',
  ':ok_hand:': '👌',
  ':muscle:': '💪',
  ':clap:': '👏',
  ':wave:': '👋',
  ':pray:': '🙏',
  ':point_right:': '👉',
  ':point_left:': '👈',
  ':heavy_plus_sign:': '➕',
  ':heavy_minus_sign:': '➖',
  ':smile:': '😊',
  ':electric_plug:': '🔌',
  ':question:': '❓',
  ':exclamation:': '❗',
};

export class EmojiProcessor extends BaseProcessor {
  readonly name = 'emoji';
  readonly description = 'Convert emoji shortcodes to Unicode emoji';
  readonly version = '1.0.0';
  readonly intermediateExtension = '.emoji.md';
  readonly supportedInputExtensions = ['.md', '.markdown'];
  readonly outputExtensions = ['.md'];
  readonly supportedOutputFormats = ['md', 'markdown'];

  /**
   * Check if content contains emoji shortcodes
   */
  canProcess(content: string): boolean {
    const emojiRegex = /:[a-zA-Z0-9_+-]+:/g;
    return emojiRegex.test(content);
  }

  /**
   * Detect emoji shortcodes in content
   * Note: For this processor, we don't extract specific "blocks" like diagrams,
   * but rather process the entire content
   */
  detectBlocks(content: string): ProcessorBlock[] {
    const emojiRegex = /:[a-zA-Z0-9_+-]+:/g;
    const matches = Array.from(content.matchAll(emojiRegex));

    if (matches.length === 0) {
      return [];
    }

    // Return a single block representing the entire content with emoji processing needed
    return [
      {
        name: 'emoji_content',
        content: content,
        startIndex: 0,
        endIndex: content.length,
        metadata: {
          shortcodes: matches.map((match) => match[0]),
          count: matches.length,
        },
      },
    ];
  }

  /**
   * Process content to convert emoji shortcodes to Unicode emoji
   */
  async process(content: string, context: ProcessingContext): Promise<ProcessingResult> {
    const blocks = this.detectBlocks(content);

    if (blocks.length === 0) {
      return {
        success: true,
        processedContent: content,
        artifacts: [],
        blocksProcessed: 0,
      };
    }

    this.ensureDirectories(context);

    const _block = blocks[0]; // We only have one block for emoji processing
    const intermediateFile = this.getIntermediateFilePath('processed', context);

    // Process emoji shortcodes
    let processedContent = content;
    const replacements: Array<{ shortcode: string; emoji: string; count: number }> = [];

    for (const [shortcode, emoji] of Object.entries(EMOJI_MAP)) {
      const regex = new RegExp(shortcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const matches = processedContent.match(regex);
      if (matches) {
        processedContent = processedContent.replace(regex, emoji);
        replacements.push({
          shortcode,
          emoji,
          count: matches.length,
        });
      }
    }

    // Check for unrecognized emoji shortcodes
    const unresolvedEmojiRegex = /:[a-zA-Z0-9_+-]+:/g;
    const unresolvedMatches = processedContent.match(unresolvedEmojiRegex);

    if (unresolvedMatches) {
      console.warn(`⚠️  Unrecognized emoji shortcodes found: ${unresolvedMatches.join(', ')}`);
      // Add comment about unrecognized shortcodes
      processedContent += `\n<!-- Unrecognized emoji shortcodes: ${unresolvedMatches.join(', ')} -->`;
    }

    // Write intermediate file for debugging
    const contentChanged = this.hasContentChanged(intermediateFile, processedContent);

    if (contentChanged) {
      fs.writeFileSync(intermediateFile, processedContent, 'utf8');
      console.info(
        `📝 Updated emoji intermediate file with ${replacements.length} types of replacements`,
      );
    } else {
      console.info(`⏭️  Skipped emoji intermediate file (unchanged)`);
    }

    // Log replacements
    if (replacements.length > 0) {
      console.info(
        `😀 Converted ${replacements.reduce((sum, r) => sum + r.count, 0)} emoji shortcodes:`,
      );
      for (const replacement of replacements.slice(0, 5)) {
        // Show first 5
        console.info(`   ${replacement.shortcode} → ${replacement.emoji} (${replacement.count}x)`);
      }
      if (replacements.length > 5) {
        console.info(`   ... and ${replacements.length - 5} more types`);
      }
    }

    const artifacts = [
      {
        name: 'processed.emoji.md',
        path: intermediateFile,
        relativePath: this.getRelativePath(intermediateFile, context),
        type: 'intermediate' as const,
      },
    ];

    return {
      success: true,
      processedContent,
      artifacts,
      blocksProcessed: 1,
    };
  }

  /**
   * Add a new emoji mapping
   */
  addEmojiMapping(shortcode: string, emoji: string): void {
    EMOJI_MAP[shortcode] = emoji;
  }

  /**
   * Get all supported emoji shortcodes
   */
  getSupportedShortcodes(): string[] {
    return Object.keys(EMOJI_MAP).sort();
  }

  /**
   * Get emoji for a specific shortcode
   */
  getEmoji(shortcode: string): string | undefined {
    return EMOJI_MAP[shortcode];
  }
}
