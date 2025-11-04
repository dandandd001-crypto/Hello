
import { useEffect, useState, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { socketService } from '@/lib/socket';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, LogOut, Crown, Send, Upload, X, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { User, Room, GameState, Message } from '@shared/schema';

interface VoteData {
  voteId: string;
  targetUserId: string;
  targetUsername: string;
  initiatorUsername: string;
  type: 'kick' | 'rejoin';
  yesCount?: number;
  noCount?: number;
}

export default function GameRoom() {
  const [, params] = useRoute('/room/:roomKey');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [room, setRoom] = useState<Room | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [messageText, setMessageText] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinRotation, setSpinRotation] = useState(0);
  const [spinDuration, setSpinDuration] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  const [showQuestionDialog, setShowQuestionDialog] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ url: string; type: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [activeVote, setActiveVote] = useState<VoteData | null>(null);
  const [inactiveUser, setInactiveUser] = useState<{ userId: string; username: string } | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const turnAnnouncementRef = useRef<HTMLDivElement>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const username = searchParams.get('username');

  useEffect(() => {
    if (!params?.roomKey || !username) {
      setLocation('/');
      return;
    }

    const socket = socketService.connect();

    const joinRoom = () => {
      socket.emit('join_room', { roomId: params.roomKey, username });
    };

    joinRoom();

    socketService.onReconnect((reconnectedSocket) => {
      setIsReconnecting(false);
      setReconnectAttempt(0);
      joinRoom();
      toast({ 
        title: 'Reconnected!', 
        description: 'You are back in the game',
        duration: 3000
      });
    });

    socket.on('connect', () => {
      setIsReconnecting(false);
    });

    socket.on('disconnect', () => {
      setIsReconnecting(true);
    });

    socket.on('reconnect_attempt', (attempt) => {
      setReconnectAttempt(attempt);
    });

    socket.on('reconnect_failed', () => {
      toast({
        title: 'Connection Lost',
        description: 'Unable to reconnect. Please refresh the page.',
        variant: 'destructive',
        duration: 0
      });
    });

    socket.on('room_joined', (data) => {
      setCurrentUser(data.user);
      setRoom(data.room);
      setUsers(data.users);
      setGameState(data.gameState);
      setMessages(data.messages || []);
    });

    socket.on('user_joined', (data) => {
      setUsers(data.users);
    });

    socket.on('user_left', (data) => {
      setUsers(data.users);
    });

    socket.on('new_host', (data) => {
      toast({ title: 'New Host', description: `${data.username} is now the host` });
      setUsers(prev => prev.map(u => ({
        ...u,
        isHost: u.id === data.userId
      })));
    });

    socket.on('game_state_updated', (data) => {
      setGameState(data);
      if (data.gamePhase === 'asking' && currentUser?.id === data.currentTurnUserId) {
        setShowQuestionDialog(true);
      }
    });

    socket.on('bottle_spinning', (data) => {
      setIsSpinning(true);
      setSpinDuration(data.duration);
      setSelectedUserId(data.targetUserId);
      
      const rotations = 3 + Math.random() * 2;
      const targetIndex = users.findIndex(u => u.id === data.targetUserId);
      const anglePerUser = 360 / users.length;
      const targetAngle = targetIndex * anglePerUser;
      const finalRotation = rotations * 360 + targetAngle;
      
      setSpinRotation(finalRotation);
      
      setTimeout(() => {
        setIsSpinning(false);
      }, data.duration);
    });

    socket.on('new_message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    socket.on('vote_started', (data) => {
      setActiveVote({
        voteId: data.voteId,
        targetUserId: data.targetUserId,
        targetUsername: data.targetUsername,
        initiatorUsername: data.initiatorUsername,
        type: data.type,
        yesCount: 0,
        noCount: 0
      });
      toast({
        title: 'Vote Started',
        description: `${data.initiatorUsername} wants to ${data.type} ${data.targetUsername}`,
      });
    });

    socket.on('vote_updated', (data) => {
      setActiveVote(prev => prev ? {
        ...prev,
        yesCount: data.yesCount,
        noCount: data.noCount
      } : null);
    });

    socket.on('vote_resolved', (data) => {
      setActiveVote(null);
      const icon = data.passed ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />;
      toast({
        title: data.passed ? 'Vote Passed' : 'Vote Failed',
        description: `${data.yesVotes} yes, ${data.noVotes} no`,
      });
    });

    socket.on('user_inactive', (data) => {
      setInactiveUser({ userId: data.userId, username: data.username });
      setTimeout(() => {
        setInactiveUser(null);
      }, 5000);
    });

    socket.on('user_used_skip', (data) => {
      toast({
        title: 'Skip Used',
        description: `${data.username} used a skip (${data.skipsRemaining} remaining)`,
      });
      setUsers(data.users);
    });

    socket.on('kicked_from_room', (data) => {
      toast({
        title: 'Removed from Room',
        description: data.reason || 'You were removed from the room',
        variant: 'destructive',
      });
      setTimeout(() => setLocation('/'), 2000);
    });

    socket.on('error', (data) => {
      const errorMessages: Record<string, string> = {
        'Not authenticated': 'Session expired. Please rejoin the room.',
        'Not enough players': 'Need at least 2 online players to spin the bottle.',
        'No skips remaining': 'You have no skips left!',
        'Room not found or expired': 'This room no longer exists. Please create a new one.',
      };
      
      const friendlyMessage = errorMessages[data.message] || data.message;
      
      toast({ 
        title: 'Error', 
        description: friendlyMessage, 
        variant: 'destructive' 
      });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnect_attempt');
      socket.off('reconnect_failed');
      socket.off('room_joined');
      socket.off('user_joined');
      socket.off('user_left');
      socket.off('new_host');
      socket.off('game_state_updated');
      socket.off('bottle_spinning');
      socket.off('new_message');
      socket.off('vote_started');
      socket.off('vote_updated');
      socket.off('vote_resolved');
      socket.off('user_inactive');
      socket.off('user_used_skip');
      socket.off('kicked_from_room');
      socket.off('error');
    };
  }, [params?.roomKey, username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleCopyRoomKey = () => {
    if (room) {
      navigator.clipboard.writeText(room.roomKey);
      toast({ title: 'Copied!', description: 'Room key copied to clipboard' });
    }
  };

  const handleLeaveRoom = () => {
    socketService.disconnect();
    setLocation('/');
  };

  const handleSpinBottle = () => {
    const socket = socketService.getSocket();
    if (socket && room) {
      socket.emit('spin_bottle', { roomId: room.id });
    }
  };

  const handleChoiceTruthOrDare = (choice: 'truth' | 'dare') => {
    const socket = socketService.getSocket();
    if (socket && room) {
      socket.emit('choose_truth_or_dare', { roomId: room.id, choice });
    }
  };

  const handleSubmitQuestion = () => {
    if (!questionText.trim()) return;
    
    const socket = socketService.getSocket();
    if (socket && room) {
      socket.emit('submit_question', { roomId: room.id, questionText });
      setQuestionText('');
      setShowQuestionDialog(false);
    }
  };

  const handleNextTurn = () => {
    const socket = socketService.getSocket();
    if (socket && room) {
      socket.emit('next_turn', { roomId: room.id });
    }
  };

  const handleUseSkip = () => {
    const socket = socketService.getSocket();
    if (socket && room) {
      socket.emit('use_skip', { roomId: room.id });
    }
  };

  const handleCastVote = (vote: boolean) => {
    const socket = socketService.getSocket();
    if (socket && room && activeVote) {
      socket.emit('cast_vote', { voteId: activeVote.voteId, vote, roomId: room.id });
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() && !uploadedFile) return;
    
    const socket = socketService.getSocket();
    if (socket && room) {
      socket.emit('send_message', {
        roomId: room.id,
        messageText: messageText.trim() || undefined,
        mediaUrl: uploadedFile?.url,
        mediaType: uploadedFile?.type,
      });
      setMessageText('');
      setUploadedFile(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: 'File Too Large', description: 'Maximum file size is 10MB', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast({ title: 'Upload Failed', description: data.error, variant: 'destructive' });
        return;
      }

      setUploadedFile({ url: data.fileUrl, type: data.mediaType });
    } catch (error) {
      toast({ title: 'Upload Error', description: 'Failed to upload file. Please try again.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleKickUser = (userId: string) => {
    const socket = socketService.getSocket();
    if (socket && room) {
      socket.emit('initiate_vote', { roomId: room.id, targetUserId: userId, type: 'kick' });
    }
  };

  if (!room || !currentUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const onlineUsers = users.filter(u => u.isOnline);
  const isMyTurn = gameState?.currentTurnUserId === currentUser.id;
  const amITarget = gameState?.targetUserId === currentUser.id;
  const currentTurnUser = users.find(u => u.id === gameState?.currentTurnUserId);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {isReconnecting && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="p-6 max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin" />
              <div>
                <p className="font-semibold">Reconnecting...</p>
                <p className="text-sm text-muted-foreground">
                  Attempt {reconnectAttempt} of 5
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <header className="h-16 border-b bg-card px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg" data-testid="text-room-key">{room.roomKey}</span>
          <Button 
            size="icon" 
            variant="ghost" 
            onClick={handleCopyRoomKey} 
            data-testid="button-copy-room-key"
            aria-label="Copy room key"
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground" data-testid="text-player-count">
            {onlineUsers.length} / 12 players
          </span>
          <Button 
            variant="outline" 
            onClick={handleLeaveRoom} 
            data-testid="button-leave-room"
            aria-label="Leave room"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Leave
          </Button>
        </div>
      </header>

      {inactiveUser && (
        <Alert className="mx-4 mt-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {inactiveUser.username} hasn't responded in 2 minutes
            </span>
            <Clock className="h-4 w-4 text-yellow-600" />
          </AlertDescription>
        </Alert>
      )}

      {activeVote && activeVote.targetUserId !== currentUser.id && (
        <Card className="mx-auto mt-4 max-w-sm p-6 space-y-4 animate-in slide-in-from-top duration-300">
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold">
              Vote to {activeVote.type} {activeVote.targetUsername}?
            </p>
            <p className="text-sm text-muted-foreground">
              Started by {activeVote.initiatorUsername}
            </p>
            <div className="text-sm text-muted-foreground">
              {(activeVote.yesCount || 0) + (activeVote.noCount || 0)} / {onlineUsers.length - 1} voted
            </div>
          </div>
          <div className="flex gap-4">
            <Button 
              className="flex-1 h-14 rounded-xl" 
              onClick={() => handleCastVote(true)}
              aria-label="Vote yes"
            >
              <CheckCircle className="mr-2 h-5 w-5" />
              Yes
            </Button>
            <Button 
              className="flex-1 h-14 rounded-xl" 
              variant="outline" 
              onClick={() => handleCastVote(false)}
              aria-label="Vote no"
            >
              <XCircle className="mr-2 h-5 w-5" />
              No
            </Button>
          </div>
        </Card>
      )}

      <div 
        ref={turnAnnouncementRef} 
        className="sr-only" 
        role="status" 
        aria-live="polite" 
        aria-atomic="true"
      >
        {isMyTurn && "It's your turn"}
        {currentTurnUser && !isMyTurn && `It's ${currentTurnUser.username}'s turn`}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
          {onlineUsers.length >= 3 && (
            <div className="relative w-96 h-96">
              {onlineUsers.map((user, index) => {
                const angle = (index * 360) / onlineUsers.length;
                const radius = 160;
                const x = Math.cos((angle - 90) * (Math.PI / 180)) * radius;
                const y = Math.sin((angle - 90) * (Math.PI / 180)) * radius;

                return (
                  <div
                    key={user.id}
                    className="absolute w-16 h-16 flex flex-col items-center"
                    style={{
                      left: `calc(50% + ${x}px - 2rem)`,
                      top: `calc(50% + ${y}px - 2rem)`,
                    }}
                    data-testid={`player-${user.username}`}
                  >
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold ${
                      user.id === gameState?.currentTurnUserId ? 'ring-4 ring-primary animate-pulse' : ''
                    } ${user.id === selectedUserId && isSpinning ? 'ring-4 ring-chart-2' : ''} bg-primary text-primary-foreground relative`}>
                      {user.username.substring(0, 2).toUpperCase()}
                      {user.isHost && (
                        <Crown className="absolute -top-2 -right-2 h-5 w-5 text-yellow-500" aria-label="Host" />
                      )}
                      {user.skipsRemaining > 0 && (
                        <Badge className="absolute -bottom-2 text-xs" aria-label={`${user.skipsRemaining} skips remaining`}>
                          {user.skipsRemaining}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs mt-1 text-center">{user.username}</span>
                  </div>
                );
              })}

              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `rotate(${spinRotation}deg)`,
                  transition: isSpinning ? `transform ${spinDuration}ms cubic-bezier(0.25, 0.1, 0.25, 1)` : 'none',
                }}
                aria-hidden="true"
              >
                <svg viewBox="0 0 100 400" className="w-12 h-48">
                  <defs>
                    <linearGradient id="bottleGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity="0.7" />
                    </linearGradient>
                  </defs>
                  <rect x="35" y="50" width="30" height="300" rx="8" fill="url(#bottleGrad)" />
                  <rect x="42" y="30" width="16" height="30" rx="4" fill="url(#bottleGrad)" />
                  <polygon points="50,350 40,400 60,400" fill="hsl(var(--primary))" />
                </svg>
              </div>
            </div>
          )}

          {onlineUsers.length === 2 && (
            <div className="space-y-8 text-center">
              <div className="flex items-center justify-center gap-8">
                {onlineUsers.map(user => (
                  <div key={user.id} className="flex flex-col items-center gap-2" data-testid={`player-${user.username}`}>
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center text-2xl font-bold ${
                      user.id === gameState?.currentTurnUserId ? 'ring-4 ring-primary animate-pulse' : ''
                    } bg-primary text-primary-foreground relative`}>
                      {user.username.substring(0, 2).toUpperCase()}
                      {user.isHost && (
                        <Crown className="absolute -top-2 -right-2 h-6 w-6 text-yellow-500" aria-label="Host" />
                      )}
                      {user.skipsRemaining > 0 && (
                        <Badge className="absolute -bottom-2" aria-label={`${user.skipsRemaining} skips remaining`}>
                          {user.skipsRemaining}
                        </Badge>
                      )}
                    </div>
                    <span className="font-medium">{user.username}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 text-center space-y-4">
            {gameState?.gamePhase === 'waiting' && onlineUsers.length >= 3 && isMyTurn && (
              <Button
                size="lg"
                onClick={handleSpinBottle}
                disabled={isSpinning}
                className="h-16 px-8 text-lg"
                data-testid="button-spin-bottle"
              >
                {isSpinning ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                Spin Bottle
              </Button>
            )}

            {gameState?.gamePhase === 'choosing' && amITarget && (
              <div className="space-y-4">
                <p className="text-xl font-bold">Choose: Truth or Dare?</p>
                <div className="flex gap-4 justify-center">
                  <Button
                    size="lg"
                    onClick={() => handleChoiceTruthOrDare('truth')}
                    className="h-14 px-8"
                    data-testid="button-choose-truth"
                  >
                    Truth
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => handleChoiceTruthOrDare('dare')}
                    className="h-14 px-8"
                    data-testid="button-choose-dare"
                  >
                    Dare
                  </Button>
                </div>
                {currentUser.skipsRemaining > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleUseSkip}
                    className="mt-2"
                    data-testid="button-use-skip"
                  >
                    Use Skip ({currentUser.skipsRemaining} left)
                  </Button>
                )}
              </div>
            )}

            {gameState?.gamePhase === 'answering' && gameState?.questionText && (
              <Card className="p-6 max-w-md mx-auto">
                <p className="text-lg font-bold mb-2">
                  {gameState.choice === 'truth' ? 'Truth' : 'Dare'}:
                </p>
                <p className="text-muted-foreground" data-testid="text-question">{gameState.questionText}</p>
                {amITarget && currentUser.skipsRemaining > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleUseSkip}
                    className="mt-4 w-full"
                    data-testid="button-use-skip"
                  >
                    Use Skip ({currentUser.skipsRemaining} left)
                  </Button>
                )}
                <Button
                  className="mt-4 w-full"
                  onClick={handleNextTurn}
                  data-testid="button-next-turn"
                >
                  Next Turn
                </Button>
              </Card>
            )}
          </div>
        </div>

        <div className="w-80 border-l bg-card flex flex-col">
          <div className="p-4 border-b">
            <h3 className="font-bold text-lg">Chat</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.map((msg) => (
              <div key={msg.id} className={`${msg.userId ? 'bg-muted' : 'bg-muted/50'} rounded-2xl p-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold">{msg.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                {msg.messageText && (
                  <p className="text-sm" data-testid={`message-${msg.id}`}>{msg.messageText}</p>
                )}
                {msg.mediaUrl && (
                  <div className="mt-2">
                    {msg.mediaType === 'image' ? (
                      <img src={msg.mediaUrl} alt="Shared media" className="rounded-lg max-h-64 object-cover" />
                    ) : (
                      <video src={msg.mediaUrl} controls className="rounded-lg max-h-64 w-full" />
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t space-y-2">
            {uploadedFile && (
              <div className="relative bg-muted rounded p-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1 right-1 h-6 w-6"
                  onClick={() => setUploadedFile(null)}
                  aria-label="Remove uploaded file"
                >
                  <X className="h-4 w-4" />
                </Button>
                {uploadedFile.type === 'image' ? (
                  <img src={uploadedFile.url} alt="Upload preview" className="rounded max-h-64 object-cover" />
                ) : (
                  <video src={uploadedFile.url} className="rounded max-h-64 w-full" />
                )}
              </div>
            )}
            
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileUpload}
                className="hidden"
                aria-label="Upload file"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                data-testid="button-upload-file"
                className="h-12 w-12"
                aria-label="Upload media"
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </Button>
              <Input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                maxLength={500}
                data-testid="input-message"
                className="h-12"
                aria-label="Type message"
              />
              <Button 
                onClick={handleSendMessage} 
                data-testid="button-send-message"
                className="h-12 w-12"
                size="icon"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showQuestionDialog} onOpenChange={setShowQuestionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Ask a {gameState?.choice === 'truth' ? 'Truth' : 'Dare'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder={`Type your ${gameState?.choice}...`}
              maxLength={500}
              className="min-h-32"
              data-testid="textarea-question"
              aria-label={`Enter ${gameState?.choice} question`}
            />
            <div className="text-sm text-muted-foreground text-right">
              {questionText.length} / 500
            </div>
            <Button
              className="w-full"
              onClick={handleSubmitQuestion}
              disabled={!questionText.trim()}
              data-testid="button-submit-question"
            >
              Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
