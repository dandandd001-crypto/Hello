import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const rooms = pgTable("rooms", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  roomKey: varchar("room_key", { length: 20 }).notNull().unique(),
  hostUserId: varchar("host_user_id", { length: 255 }),
  maxSkips: integer("max_skips").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastActivity: timestamp("last_activity").notNull().defaultNow(),
  isExpired: boolean("is_expired").notNull().default(false),
});

export const users = pgTable("users", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 50 }).notNull(),
  roomId: varchar("room_id", { length: 255 }).references(() => rooms.id, { onDelete: 'cascade' }),
  isHost: boolean("is_host").notNull().default(false),
  isOnline: boolean("is_online").notNull().default(true),
  skipsRemaining: integer("skips_remaining").notNull().default(0),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
  socketId: varchar("socket_id", { length: 255 }),
});

export const messages = pgTable("messages", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id", { length: 255 }).notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: varchar("user_id", { length: 255 }).references(() => users.id, { onDelete: 'set null' }),
  username: varchar("username", { length: 50 }).notNull(),
  messageText: text("message_text"),
  mediaUrl: text("media_url"),
  mediaType: varchar("media_type", { length: 10 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const kickedUsers = pgTable("kicked_users", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id", { length: 255 }).notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  username: varchar("username", { length: 50 }).notNull(),
  kickedAt: timestamp("kicked_at").notNull().defaultNow(),
  rejoinAttempts: integer("rejoin_attempts").notNull().default(0),
  lastRejoinAttempt: timestamp("last_rejoin_attempt"),
  isPermanentlyBlocked: boolean("is_permanently_blocked").notNull().default(false),
});

export const gameState = pgTable("game_state", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  roomId: varchar("room_id", { length: 255 }).notNull().unique().references(() => rooms.id, { onDelete: 'cascade' }),
  currentTurnUserId: varchar("current_turn_user_id", { length: 255 }),
  targetUserId: varchar("target_user_id", { length: 255 }),
  gamePhase: varchar("game_phase", { length: 20 }).notNull().default('waiting'),
  questionText: text("question_text"),
  choice: varchar("choice", { length: 10 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rateLimits = pgTable("rate_limits", {
  id: varchar("id", { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  ipAddress: varchar("ip_address", { length: 45 }).notNull(),
  actionType: varchar("action_type", { length: 20 }).notNull(),
  count: integer("count").notNull().default(1),
  windowStart: timestamp("window_start").notNull().defaultNow(),
});

// Insert schemas
export const insertRoomSchema = createInsertSchema(rooms).pick({
  roomKey: true,
  maxSkips: true,
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  roomId: true,
  skipsRemaining: true,
}).extend({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric with underscores only"),
});

export const insertMessageSchema = createInsertSchema(messages).pick({
  roomId: true,
  messageText: true,
}).extend({
  messageText: z.string().min(1).max(500).optional(),
});

export const insertKickedUserSchema = createInsertSchema(kickedUsers).pick({
  roomId: true,
  ipAddress: true,
  username: true,
});

export const insertGameStateSchema = createInsertSchema(gameState).pick({
  roomId: true,
  gamePhase: true,
});

// Types
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type Room = typeof rooms.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export type InsertKickedUser = z.infer<typeof insertKickedUserSchema>;
export type KickedUser = typeof kickedUsers.$inferSelect;

export type InsertGameState = z.infer<typeof insertGameStateSchema>;
export type GameState = typeof gameState.$inferSelect;

export type RateLimit = typeof rateLimits.$inferSelect;
