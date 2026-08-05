import type { Collection, ChatInputCommandInteraction } from "discord.js";

export interface CommandContext {
  client: import("discord.js").Client;
  interaction: ChatInputCommandInteraction;
}

/**
 * Data type broad enough to cover both SlashCommandBuilder and the narrowed
 * SlashCommandOptionsOnlyBuilder (returned after calling .addStringOption etc.)
 */
type SlashCommandData = {
  name: string;
  description: string;
  toJSON(): object;
};

export interface SlashCommand {
  data: SlashCommandData;
  /** Returning a value is allowed for early-exit patterns (return interaction.editReply(...)). */
  run(ctx: CommandContext): Promise<unknown>;
}

// Augment discord.js Client to include slashcommands collection
declare module "discord.js" {
  interface Client {
    slashcommands: Collection<string, SlashCommand>;
  }
}
