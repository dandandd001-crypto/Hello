import { type Room, type User, type Message, type KickedUser, type GameState, type RateLimit } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Room operations
  createRoom(roomKey: string, maxSkips: number, hostUserId: string): Promise<Room>;
  getRoom(roomId: string): Promise<Room | undefined>;
  getRoomByKey(roomKey: string): Promise<Room | undefined>;
  updateRoomActivity(roomId: string): Promise<void>;
  updateRoomHost(roomId: string, newHostUserId: string): Promise<void>;
  expireRoom(roomId: string): Promise<void>;
  getInactiveRooms(minutesInactive: number): Promise<Room[]>;
  deleteRoom(roomId: string): Promise<void>;

  // User operations
  createUser(username: string, roomId: string, skipsRemaining: number, socketId: string): Promise<User>;
  getUser(userId: string): Promise<User | undefined>;
  getUsersByRoom(roomId: string): Promise<User[]>;
  getUserBySocketId(socketId: string): Promise<User | undefined>;
  updateUserOnline(userId: string, isOnline: boolean, socketId?: string): Promise<void>;
  updateUserSkips(userId: string, skipsRemaining: number): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  makeUserHost(userId: string): Promise<void>;

  // Message operations
  createMessage(roomId: string, userId: string | null, username: string, messageText?: string, mediaUrl?: string, mediaType?: string): Promise<Message>;
  getMessagesByRoom(roomId: string, limit?: number): Promise<Message[]>;
  deleteMessagesByRoom(roomId: string): Promise<void>;

  // Kicked user operations
  createKickedUser(roomId: string, ipAddress: string, username: string): Promise<KickedUser>;
  getKickedUser(roomId: string, ipAddress: string): Promise<KickedUser | undefined>;
  incrementRejoinAttempts(id: string): Promise<void>;
  blockUserPermanently(id: string): Promise<void>;

  // Game state operations
  createGameState(roomId: string): Promise<GameState>;
  getGameState(roomId: string): Promise<GameState | undefined>;
  updateGameState(roomId: string, updates: Partial<GameState>): Promise<void>;

  // Rate limit operations
  getRateLimit(ipAddress: string, actionType: string): Promise<RateLimit | undefined>;
  createRateLimit(ipAddress: string, actionType: string): Promise<RateLimit>;
  incrementRateLimit(id: string): Promise<void>;
  cleanupRateLimits(olderThanMinutes: number): Promise<void>;
}

export class MemStorage implements IStorage {
  private rooms: Map<string, Room>;
  private users: Map<string, User>;
  private messages: Map<string, Message>;
  private kickedUsers: Map<string, KickedUser>;
  private gameStates: Map<string, GameState>;
  private rateLimits: Map<string, RateLimit>;

  constructor() {
    this.rooms = new Map();
    this.users = new Map();
    this.messages = new Map();
    this.kickedUsers = new Map();
    this.gameStates = new Map();
    this.rateLimits = new Map();
  }

  async createRoom(roomKey: string, maxSkips: number, hostUserId: string): Promise<Room> {
    const id = randomUUID();
    const room: Room = {
      id,
      roomKey,
      hostUserId,
      maxSkips,
      createdAt: new Date(),
      lastActivity: new Date(),
      isExpired: false,
    };
    this.rooms.set(id, room);
    return room;
  }

  async getRoom(roomId: string): Promise<Room | undefined> {
    return this.rooms.get(roomId);
  }

  async getRoomByKey(roomKey: string): Promise<Room | undefined> {
    return Array.from(this.rooms.values()).find(r => r.roomKey === roomKey);
  }

  async updateRoomActivity(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      room.lastActivity = new Date();
      this.rooms.set(roomId, room);
    }
  }

  async updateRoomHost(roomId: string, newHostUserId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      room.hostUserId = newHostUserId;
      this.rooms.set(roomId, room);
    }
  }

  async expireRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (room) {
      room.isExpired = true;
      this.rooms.set(roomId, room);
    }
  }

  async getInactiveRooms(minutesInactive: number): Promise<Room[]> {
    const cutoff = new Date(Date.now() - minutesInactive * 60 * 1000);
    return Array.from(this.rooms.values()).filter(r => 
      !r.isExpired && r.lastActivity < cutoff
    );
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.rooms.delete(roomId);
  }

  async createUser(username: string, roomId: string, skipsRemaining: number, socketId: string): Promise<User> {
    const id = randomUUID();
    const user: User = {
      id,
      username,
      roomId,
      isHost: false,
      isOnline: true,
      skipsRemaining,
      joinedAt: new Date(),
      socketId,
    };
    this.users.set(id, user);
    return user;
  }

  async getUser(userId: string): Promise<User | undefined> {
    return this.users.get(userId);
  }

  async getUsersByRoom(roomId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(u => u.roomId === roomId);
  }

  async getUserBySocketId(socketId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(u => u.socketId === socketId);
  }

  async updateUserOnline(userId: string, isOnline: boolean, socketId?: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.isOnline = isOnline;
      if (socketId !== undefined) user.socketId = socketId;
      this.users.set(userId, user);
    }
  }

  async updateUserSkips(userId: string, skipsRemaining: number): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.skipsRemaining = skipsRemaining;
      this.users.set(userId, user);
    }
  }

  async deleteUser(userId: string): Promise<void> {
    this.users.delete(userId);
  }

  async makeUserHost(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.isHost = true;
      this.users.set(userId, user);
    }
  }

  async createMessage(roomId: string, userId: string | null, username: string, messageText?: string, mediaUrl?: string, mediaType?: string): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      id,
      roomId,
      userId,
      username,
      messageText: messageText || null,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      createdAt: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async getMessagesByRoom(roomId: string, limit: number = 100): Promise<Message[]> {
    const roomMessages = Array.from(this.messages.values())
      .filter(m => m.roomId === roomId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
    return roomMessages.reverse();
  }

  async deleteMessagesByRoom(roomId: string): Promise<void> {
    const messageIds = Array.from(this.messages.entries())
      .filter(([_, m]) => m.roomId === roomId)
      .map(([id]) => id);
    messageIds.forEach(id => this.messages.delete(id));
  }

  async createKickedUser(roomId: string, ipAddress: string, username: string): Promise<KickedUser> {
    const id = randomUUID();
    const kickedUser: KickedUser = {
      id,
      roomId,
      ipAddress,
      username,
      kickedAt: new Date(),
      rejoinAttempts: 0,
      lastRejoinAttempt: null,
      isPermanentlyBlocked: false,
    };
    this.kickedUsers.set(id, kickedUser);
    return kickedUser;
  }

  async getKickedUser(roomId: string, ipAddress: string): Promise<KickedUser | undefined> {
    return Array.from(this.kickedUsers.values()).find(
      ku => ku.roomId === roomId && ku.ipAddress === ipAddress
    );
  }

  async incrementRejoinAttempts(id: string): Promise<void> {
    const kickedUser = this.kickedUsers.get(id);
    if (kickedUser) {
      kickedUser.rejoinAttempts += 1;
      kickedUser.lastRejoinAttempt = new Date();
      this.kickedUsers.set(id, kickedUser);
    }
  }

  async blockUserPermanently(id: string): Promise<void> {
    const kickedUser = this.kickedUsers.get(id);
    if (kickedUser) {
      kickedUser.isPermanentlyBlocked = true;
      this.kickedUsers.set(id, kickedUser);
    }
  }

  async createGameState(roomId: string): Promise<GameState> {
    const id = randomUUID();
    const gameState: GameState = {
      id,
      roomId,
      currentTurnUserId: null,
      targetUserId: null,
      gamePhase: 'waiting',
      questionText: null,
      choice: null,
      updatedAt: new Date(),
    };
    this.gameStates.set(id, gameState);
    return gameState;
  }

  async getGameState(roomId: string): Promise<GameState | undefined> {
    return Array.from(this.gameStates.values()).find(gs => gs.roomId === roomId);
  }

  async updateGameState(roomId: string, updates: Partial<GameState>): Promise<void> {
    const gameState = await this.getGameState(roomId);
    if (gameState) {
      Object.assign(gameState, updates, { updatedAt: new Date() });
      this.gameStates.set(gameState.id, gameState);
    }
  }

  async getRateLimit(ipAddress: string, actionType: string): Promise<RateLimit | undefined> {
    return Array.from(this.rateLimits.values()).find(
      rl => rl.ipAddress === ipAddress && rl.actionType === actionType
    );
  }

  async createRateLimit(ipAddress: string, actionType: string): Promise<RateLimit> {
    const id = randomUUID();
    const rateLimit: RateLimit = {
      id,
      ipAddress,
      actionType,
      count: 1,
      windowStart: new Date(),
    };
    this.rateLimits.set(id, rateLimit);
    return rateLimit;
  }

  async incrementRateLimit(id: string): Promise<void> {
    const rateLimit = this.rateLimits.get(id);
    if (rateLimit) {
      rateLimit.count += 1;
      this.rateLimits.set(id, rateLimit);
    }
  }

  async cleanupRateLimits(olderThanMinutes: number): Promise<void> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const toDelete = Array.from(this.rateLimits.entries())
      .filter(([_, rl]) => rl.windowStart < cutoff)
      .map(([id]) => id);
    toDelete.forEach(id => this.rateLimits.delete(id));
  }
}

export const storage = new MemStorage();
