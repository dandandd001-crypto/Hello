import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Copy, Check } from 'lucide-react';

export default function Landing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [maxSkips, setMaxSkips] = useState('0');
  const [joinUsername, setJoinUsername] = useState('');
  const [roomKey, setRoomKey] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [createdRoomKey, setCreatedRoomKey] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCreateRoom = async () => {
    if (!createUsername.trim() || createUsername.length < 3) {
      toast({ title: 'Error', description: 'Username must be at least 3 characters', variant: 'destructive' });
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: createUsername, maxSkips: parseInt(maxSkips) }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
        return;
      }

      setCreatedRoomKey(data.roomKey);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to create room', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(createdRoomKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied!', description: 'Room key copied to clipboard' });
  };

  const handleEnterRoom = () => {
    setLocation(`/room/${createdRoomKey}?username=${encodeURIComponent(createUsername)}`);
  };

  const handleJoinRoom = async () => {
    if (!joinUsername.trim() || joinUsername.length < 3) {
      toast({ title: 'Error', description: 'Username must be at least 3 characters', variant: 'destructive' });
      return;
    }

    if (!roomKey.trim()) {
      toast({ title: 'Error', description: 'Please enter a room key', variant: 'destructive' });
      return;
    }

    setIsJoining(true);
    try {
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: joinUsername, roomKey: roomKey.toUpperCase() }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({ title: 'Error', description: data.error, variant: 'destructive' });
        return;
      }

      setLocation(`/room/${roomKey.toUpperCase()}?username=${encodeURIComponent(joinUsername)}`);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to join room', variant: 'destructive' });
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/20 via-background to-chart-2/20 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl mx-auto text-center space-y-12">
        <div className="space-y-6">
          <h1 className="text-6xl md:text-8xl font-black tracking-wide text-foreground">
            Truth or Dare
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground font-medium">
            Play with friends anywhere
          </p>
        </div>

        <div className="flex justify-center">
          <div className="w-64 h-64 relative">
            <svg viewBox="0 0 200 200" className="w-full h-full animate-[spin_20s_linear_infinite]">
              <defs>
                <linearGradient id="bottleGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity="0.6" />
                </linearGradient>
              </defs>
              <g transform="translate(100, 100)">
                <ellipse cx="0" cy="0" rx="20" ry="8" fill="url(#bottleGradient)" opacity="0.3" />
                <rect x="-15" y="-80" width="30" height="160" rx="8" fill="url(#bottleGradient)" />
                <rect x="-8" y="-100" width="16" height="30" rx="4" fill="url(#bottleGradient)" opacity="0.9" />
                <ellipse cx="0" cy="-80" rx="15" ry="6" fill="hsl(var(--primary))" opacity="0.5" />
              </g>
            </svg>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          <Button
            size="lg"
            className="h-16 text-lg font-bold rounded-2xl"
            onClick={() => setShowCreateDialog(true)}
            data-testid="button-create-room"
          >
            Create Room
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-16 text-lg font-bold rounded-2xl"
            onClick={() => setShowJoinDialog(true)}
            data-testid="button-join-room"
          >
            Join Room
          </Button>
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          {!createdRoomKey ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">Create Room</DialogTitle>
                <DialogDescription>Set up your game room</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="space-y-2">
                  <Label htmlFor="create-username">Your Username</Label>
                  <Input
                    id="create-username"
                    placeholder="Enter your name"
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    maxLength={20}
                    data-testid="input-create-username"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-skips">Max Skips Per Player</Label>
                  <Select value={maxSkips} onValueChange={setMaxSkips}>
                    <SelectTrigger id="max-skips" data-testid="select-max-skips">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0 (No skips)</SelectItem>
                      <SelectItem value="1">1</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="999">Unlimited</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full h-12"
                  onClick={handleCreateRoom}
                  disabled={isCreating}
                  data-testid="button-create-room-submit"
                >
                  {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Room
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">Room Created!</DialogTitle>
                <DialogDescription>Share this code with your friends</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                <div className="flex items-center gap-2">
                  <Input
                    value={createdRoomKey}
                    readOnly
                    className="text-3xl font-mono tracking-widest text-center"
                    data-testid="text-room-key"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleCopyKey}
                    data-testid="button-copy-key"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <Button
                  className="w-full h-12"
                  onClick={handleEnterRoom}
                  data-testid="button-enter-room"
                >
                  Enter Room
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl">Join Room</DialogTitle>
            <DialogDescription>Enter the room code to join</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="join-username">Your Username</Label>
              <Input
                id="join-username"
                placeholder="Enter your name"
                value={joinUsername}
                onChange={(e) => setJoinUsername(e.target.value)}
                maxLength={20}
                data-testid="input-join-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="room-key">Room Key</Label>
              <Input
                id="room-key"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={roomKey}
                onChange={(e) => setRoomKey(e.target.value.toUpperCase())}
                className="font-mono tracking-widest text-center"
                data-testid="input-room-key"
              />
            </div>
            <Button
              className="w-full h-12"
              onClick={handleJoinRoom}
              disabled={isJoining}
              data-testid="button-join-room-submit"
            >
              {isJoining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Join Room
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
