import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { storage } from "./storage";
import { generateRoomKey } from "./utils/roomKeyGenerator";
import { checkRateLimit } from "./utils/rateLimiter";
import { upload, deleteAllFilesInRoom } from "./utils/fileUpload";
import { insertUserSchema, insertMessageSchema } from "@shared/schema";
import path from "path";

interface SocketData {
  userId?: string;
  roomId?: string;
  username?: string;
}

interface VoteData {
  voteId: string;
  targetUserId: string;
  targetUsername: string;
  initiatorUserId: string;
  initiatorUsername: string;
  type: 'kick' | 'rejoin';
  votes: Map<string, boolean>;
  timer?: NodeJS.Timeout;
}

const activeVotes = new Map<string, VoteData>();
const inactivityTimers = new Map<string, NodeJS.Timeout>();

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] as string ||
         req.socket.remoteAddress ||
         '0.0.0.0';
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' ? false : '*',
      credentials: true,
    },
  });

  // Serve uploaded files
  app.use('/uploads', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  }, (req, res, next) => {
    const filename = path.basename(req.path);
    const filepath = path.join(process.cwd(), 'uploads', filename);
    res.sendFile(filepath, (err) => {
      if (err) {
        res.status(404).json({ error: 'File not found' });
      }
    });
  });

  // Create room
  app.post('/api/rooms/create', async (req: Request, res: Response) => {
    try {
      const ipAddress = getClientIp(req);
      const rateLimitCheck = await checkRateLimit(ipAddress, 'room_creation');
      
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ 
          error: `Slow down! You're creating too many rooms. Try again in ${rateLimitCheck.retryAfter} seconds.` 
        });
      }

      const { username, maxSkips } = req.body;

      if (!username || typeof username !== 'string' || username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: 'Invalid username' });
      }

      const roomKey = generateRoomKey();
      const tempUserId = 'temp-' + Date.now();
      const room = await storage.createRoom(roomKey, maxSkips || 0, tempUserId);
      await storage.createGameState(room.id);

      res.json({ roomId: room.id, roomKey: room.roomKey, maxSkips: room.maxSkips });
    } catch (error) {
      console.error('Error creating room:', error);
      res.status(500).json({ error: 'Failed to create room' });
    }
  });

  // Join room
  app.post('/api/rooms/join', async (req: Request, res: Response) => {
    try {
      const { roomKey, username } = req.body;
      const ipAddress = getClientIp(req);

      if (!roomKey || !username) {
        return res.status(400).json({ error: 'Room key and username are required' });
      }

      const room = await storage.getRoomByKey(roomKey.toUpperCase());
      
      if (!room) {
        return res.status(404).json({ error: 'Room not found. Check your code and try again.' });
      }

      if (room.isExpired) {
        return res.status(410).json({ error: 'This room has expired. Create a new room to play!' });
      }

      const kickedUser = await storage.getKickedUser(room.id, ipAddress);
      
      if (kickedUser) {
        if (kickedUser.isPermanentlyBlocked) {
          return res.status(403).json({ 
            error: 'You have been permanently blocked from this room.',
            requiresVote: false
          });
        }

        const rateLimitCheck = await checkRateLimit(ipAddress, 'rejoin');
        if (!rateLimitCheck.allowed) {
          return res.status(429).json({ 
            error: `Slow down! Try again in ${rateLimitCheck.retryAfter} seconds.` 
          });
        }

        if (kickedUser.rejoinAttempts >= 10) {
          await storage.blockUserPermanently(kickedUser.id);
          return res.status(403).json({ 
            error: 'Maximum rejoin attempts exceeded. You are permanently blocked from this room.',
            requiresVote: false
          });
        }

        return res.status(403).json({ 
          error: 'You were removed from this room. Requesting to rejoin...',
          requiresVote: true,
          roomId: room.id,
          username
        });
      }

      res.json({ roomId: room.id, roomKey: room.roomKey, maxSkips: room.maxSkips });
    } catch (error) {
      console.error('Error joining room:', error);
      res.status(500).json({ error: 'Failed to join room' });
    }
  });

  // Upload file for chat
  app.post('/api/chat/upload', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const ipAddress = getClientIp(req);
      const rateLimitCheck = await checkRateLimit(ipAddress, 'file_upload');
      
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({ 
          error: `Slow down! Wait ${rateLimitCheck.retryAfter} seconds before uploading another file.` 
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const fileUrl = `/uploads/${req.file.filename}`;
      const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';

      res.json({ fileUrl, mediaType });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });

  // Socket.IO connection handling
  io.on('connection', async (socket: Socket) => {
    console.log('Client connected:', socket.id);
    const socketData: SocketData = {};

    socket.on('join_room', async (data: { roomId: string; username: string }) => {
      try {
        const { roomId, username } = data;
        
        const room = await storage.getRoom(roomId);
        if (!room || room.isExpired) {
          socket.emit('error', { message: 'Room not found or expired' });
          return;
        }

        await storage.updateRoomActivity(roomId);

        const user = await storage.createUser(username, roomId, room.maxSkips, socket.id);
        
        socketData.userId = user.id;
        socketData.roomId = roomId;
        socketData.username = username;

        const users = await storage.getUsersByRoom(roomId);
        
        if (users.length === 1) {
          await storage.makeUserHost(user.id);
          await storage.updateRoomHost(roomId, user.id);
        }

        socket.join(roomId);

        const allUsers = await storage.getUsersByRoom(roomId);
        const gameState = await storage.getGameState(roomId);
        const messages = await storage.getMessagesByRoom(roomId);

        socket.emit('room_joined', { 
          user, 
          room, 
          users: allUsers, 
          gameState,
          messages
        });

        io.to(roomId).emit('user_joined', { 
          user,
          users: allUsers
        });

        await storage.createMessage(
          roomId,
          null,
          'System',
          `${username} joined the game`,
          undefined,
          undefined
        );

        const updatedMessages = await storage.getMessagesByRoom(roomId);
        io.to(roomId).emit('new_message', updatedMessages[updatedMessages.length - 1]);

        if (allUsers.length === 2 && gameState?.gamePhase === 'waiting') {
          await storage.updateGameState(roomId, {
            currentTurnUserId: allUsers[0].id,
            gamePhase: 'choosing'
          });
          
          const newGameState = await storage.getGameState(roomId);
          io.to(roomId).emit('game_state_updated', newGameState);
        }
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('send_message', async (data: { roomId: string; messageText?: string; mediaUrl?: string; mediaType?: string }) => {
      try {
        if (!socketData.userId || !socketData.roomId || !socketData.username) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const message = await storage.createMessage(
          data.roomId,
          socketData.userId,
          socketData.username,
          data.messageText,
          data.mediaUrl,
          data.mediaType
        );

        await storage.updateRoomActivity(data.roomId);

        io.to(data.roomId).emit('new_message', message);
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('spin_bottle', async (data: { roomId: string }) => {
      try {
        if (!socketData.userId || !socketData.roomId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const users = await storage.getUsersByRoom(data.roomId);
        const onlineUsers = users.filter(u => u.isOnline);
        
        if (onlineUsers.length < 2) {
          socket.emit('error', { message: 'Not enough players' });
          return;
        }

        const otherUsers = onlineUsers.filter(u => u.id !== socketData.userId);
        const targetUser = otherUsers[Math.floor(Math.random() * otherUsers.length)];
        
        const durations = [2000, 4500, 7000];
        const duration = durations[Math.floor(Math.random() * durations.length)];

        await storage.updateGameState(data.roomId, {
          gamePhase: 'spinning',
          targetUserId: targetUser.id
        });

        io.to(data.roomId).emit('bottle_spinning', { 
          targetUserId: targetUser.id, 
          duration,
          spinnerUserId: socketData.userId
        });

        setTimeout(async () => {
          await storage.updateGameState(data.roomId, {
            gamePhase: 'choosing',
            targetUserId: targetUser.id
          });

          const gameState = await storage.getGameState(data.roomId);
          io.to(data.roomId).emit('game_state_updated', gameState);

          startInactivityTimer(data.roomId, targetUser.id, targetUser.username);
        }, duration + 1000);

      } catch (error) {
        console.error('Error spinning bottle:', error);
        socket.emit('error', { message: 'Failed to spin bottle' });
      }
    });

    socket.on('choose_truth_or_dare', async (data: { roomId: string; choice: 'truth' | 'dare' }) => {
      try {
        if (!socketData.userId) return;

        clearInactivityTimer(socketData.userId);

        await storage.updateGameState(data.roomId, {
          gamePhase: 'asking',
          choice: data.choice
        });

        const gameState = await storage.getGameState(data.roomId);
        io.to(data.roomId).emit('game_state_updated', gameState);

        const currentTurnUser = await storage.getUser(gameState?.currentTurnUserId || '');
        if (currentTurnUser) {
          startInactivityTimer(data.roomId, currentTurnUser.id, currentTurnUser.username);
        }
      } catch (error) {
        console.error('Error choosing truth or dare:', error);
      }
    });

    socket.on('submit_question', async (data: { roomId: string; questionText: string }) => {
      try {
        if (!socketData.userId) return;

        clearInactivityTimer(socketData.userId);

        await storage.updateGameState(data.roomId, {
          gamePhase: 'answering',
          questionText: data.questionText
        });

        const gameState = await storage.getGameState(data.roomId);
        io.to(data.roomId).emit('game_state_updated', gameState);
      } catch (error) {
        console.error('Error submitting question:', error);
      }
    });

    socket.on('next_turn', async (data: { roomId: string }) => {
      try {
        const users = await storage.getUsersByRoom(data.roomId);
        const onlineUsers = users.filter(u => u.isOnline);
        
        if (onlineUsers.length < 2) return;

        const gameState = await storage.getGameState(data.roomId);
        const currentIndex = onlineUsers.findIndex(u => u.id === gameState?.currentTurnUserId);
        const nextIndex = (currentIndex + 1) % onlineUsers.length;
        const nextUser = onlineUsers[nextIndex];

        await storage.updateGameState(data.roomId, {
          currentTurnUserId: nextUser.id,
          targetUserId: null,
          gamePhase: onlineUsers.length === 2 ? 'choosing' : 'waiting',
          questionText: null,
          choice: null
        });

        const newGameState = await storage.getGameState(data.roomId);
        io.to(data.roomId).emit('game_state_updated', newGameState);
      } catch (error) {
        console.error('Error moving to next turn:', error);
      }
    });

    socket.on('use_skip', async (data: { roomId: string }) => {
      try {
        if (!socketData.userId) return;

        const user = await storage.getUser(socketData.userId);
        if (!user || user.skipsRemaining <= 0) {
          socket.emit('error', { message: 'No skips remaining' });
          return;
        }

        await storage.updateUserSkips(socketData.userId, user.skipsRemaining - 1);
        
        const users = await storage.getUsersByRoom(data.roomId);
        io.to(data.roomId).emit('user_used_skip', { 
          userId: socketData.userId, 
          username: socketData.username,
          skipsRemaining: user.skipsRemaining - 1,
          users
        });

        socket.emit('next_turn', { roomId: data.roomId });
      } catch (error) {
        console.error('Error using skip:', error);
      }
    });

    socket.on('initiate_vote', async (data: { roomId: string; targetUserId: string; type: 'kick' | 'rejoin' }) => {
      try {
        if (!socketData.userId || !socketData.username) return;

        const targetUser = await storage.getUser(data.targetUserId);
        if (!targetUser) return;

        const voteId = `vote-${Date.now()}-${Math.random()}`;
        const voteData: VoteData = {
          voteId,
          targetUserId: data.targetUserId,
          targetUsername: targetUser.username,
          initiatorUserId: socketData.userId,
          initiatorUsername: socketData.username,
          type: data.type,
          votes: new Map(),
        };

        activeVotes.set(voteId, voteData);

        io.to(data.roomId).emit('vote_started', {
          voteId,
          targetUserId: data.targetUserId,
          targetUsername: targetUser.username,
          initiatorUsername: socketData.username,
          type: data.type
        });

        voteData.timer = setTimeout(() => {
          resolveVote(voteId, data.roomId);
        }, 30000);
      } catch (error) {
        console.error('Error initiating vote:', error);
      }
    });

    socket.on('cast_vote', async (data: { voteId: string; vote: boolean; roomId: string }) => {
      try {
        if (!socketData.userId) return;

        const voteData = activeVotes.get(data.voteId);
        if (!voteData) return;

        voteData.votes.set(socketData.userId, data.vote);

        io.to(data.roomId).emit('vote_updated', {
          voteId: data.voteId,
          yesCount: Array.from(voteData.votes.values()).filter(v => v).length,
          noCount: Array.from(voteData.votes.values()).filter(v => !v).length
        });

        const users = await storage.getUsersByRoom(data.roomId);
        const eligibleVoters = users.filter(u => u.id !== voteData.targetUserId).length;

        if (voteData.votes.size >= eligibleVoters) {
          if (voteData.timer) clearTimeout(voteData.timer);
          await resolveVote(data.voteId, data.roomId);
        }
      } catch (error) {
        console.error('Error casting vote:', error);
      }
    });

    async function resolveVote(voteId: string, roomId: string) {
      const voteData = activeVotes.get(voteId);
      if (!voteData) return;

      const yesVotes = Array.from(voteData.votes.values()).filter(v => v).length;
      const noVotes = Array.from(voteData.votes.values()).filter(v => !v).length;
      const passed = yesVotes > noVotes;

      if (passed && voteData.type === 'kick') {
        const targetUser = await storage.getUser(voteData.targetUserId);
        if (targetUser) {
          const ipAddress = socket.handshake.headers['x-forwarded-for'] as string || socket.handshake.address;
          await storage.createKickedUser(roomId, ipAddress, targetUser.username);
          
          await storage.deleteUser(voteData.targetUserId);
          
          const targetSocket = Array.from(io.sockets.sockets.values()).find(
            s => (s.data as SocketData).userId === voteData.targetUserId
          );
          
          if (targetSocket) {
            targetSocket.emit('kicked_from_room', { reason: 'Voted out by other players' });
            targetSocket.leave(roomId);
          }

          const remainingUsers = await storage.getUsersByRoom(roomId);
          io.to(roomId).emit('user_left', { userId: voteData.targetUserId, users: remainingUsers });

          if (remainingUsers.length > 0 && targetUser.isHost) {
            const oldestUser = remainingUsers.sort((a, b) => 
              a.joinedAt.getTime() - b.joinedAt.getTime()
            )[0];
            
            await storage.makeUserHost(oldestUser.id);
            await storage.updateRoomHost(roomId, oldestUser.id);
            
            io.to(roomId).emit('new_host', { userId: oldestUser.id, username: oldestUser.username });
          }
        }
      }

      io.to(roomId).emit('vote_resolved', {
        voteId,
        passed,
        yesVotes,
        noVotes
      });

      activeVotes.delete(voteId);
    }

    function startInactivityTimer(roomId: string, userId: string, username: string) {
      clearInactivityTimer(userId);

      const timer = setTimeout(async () => {
        io.to(roomId).emit('user_inactive', { userId, username });
        
        setTimeout(() => {
          const voteId = `inactivity-${userId}-${Date.now()}`;
          const voteData: VoteData = {
            voteId,
            targetUserId: userId,
            targetUsername: username,
            initiatorUserId: 'system',
            initiatorUsername: 'System',
            type: 'kick',
            votes: new Map(),
          };

          activeVotes.set(voteId, voteData);

          io.to(roomId).emit('vote_started', {
            voteId,
            targetUserId: userId,
            targetUsername: username,
            initiatorUsername: 'System (Inactivity)',
            type: 'kick'
          });

          voteData.timer = setTimeout(() => {
            resolveVote(voteId, roomId);
          }, 30000);
        }, 5000);
      }, 120000);

      inactivityTimers.set(userId, timer);
    }

    function clearInactivityTimer(userId: string) {
      const timer = inactivityTimers.get(userId);
      if (timer) {
        clearTimeout(timer);
        inactivityTimers.delete(userId);
      }
    }

    socket.on('disconnect', async () => {
      console.log('Client disconnected:', socket.id);
      
      if (socketData.userId) {
        clearInactivityTimer(socketData.userId);
        
        const reconnectTimeout = setTimeout(async () => {
          if (!socketData.userId || !socketData.roomId) return;

          const user = await storage.getUser(socketData.userId);
          if (user && user.socketId === socket.id) {
            await storage.updateUserOnline(socketData.userId, false);
            
            const users = await storage.getUsersByRoom(socketData.roomId);
            const onlineUsers = users.filter(u => u.isOnline);

            io.to(socketData.roomId).emit('user_left', { 
              userId: socketData.userId, 
              users 
            });

            if (onlineUsers.length === 0) {
              console.log('Room empty, will expire after inactivity');
            } else if (user.isHost) {
              const oldestOnlineUser = onlineUsers.sort((a, b) => 
                a.joinedAt.getTime() - b.joinedAt.getTime()
              )[0];
              
              if (oldestOnlineUser) {
                await storage.makeUserHost(oldestOnlineUser.id);
                await storage.updateRoomHost(socketData.roomId, oldestOnlineUser.id);
                
                io.to(socketData.roomId).emit('new_host', { 
                  userId: oldestOnlineUser.id, 
                  username: oldestOnlineUser.username 
                });
              }
            }
          }
        }, 120000);

        setTimeout(() => {
          clearTimeout(reconnectTimeout);
        }, 120000);
      }
    });
  });

  setInterval(async () => {
    try {
      const inactiveRooms = await storage.getInactiveRooms(30);
      
      for (const room of inactiveRooms) {
        const messages = await storage.getMessagesByRoom(room.id);
        deleteAllFilesInRoom(room.id, messages);
        
        await storage.deleteMessagesByRoom(room.id);
        await storage.expireRoom(room.id);
        await storage.deleteRoom(room.id);
        
        console.log(`Expired and cleaned up room: ${room.roomKey}`);
      }
    } catch (error) {
      console.error('Error in cleanup job:', error);
    }
  }, 5 * 60 * 1000);

  return httpServer;
}
