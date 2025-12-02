import { useState } from 'react';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, ChevronDown, Plus, Check } from 'lucide-react';

export function RestaurantSwitcher() {
  const { currentRestaurant, userRestaurants, switchRestaurant, createRestaurant } = useRestaurant();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    await createRestaurant(newName.trim());
    setNewName('');
    setIsCreateOpen(false);
    setIsCreating(false);
  };

  if (!currentRestaurant) {
    return (
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Create Restaurant
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Your Restaurant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Restaurant Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Restaurant"
              />
            </div>
            <Button onClick={handleCreate} disabled={isCreating || !newName.trim()}>
              {isCreating ? 'Creating...' : 'Create Restaurant'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Building2 className="h-4 w-4" />
          <span className="max-w-[150px] truncate">{currentRestaurant.name}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-popover">
        {userRestaurants.map((restaurant) => (
          <DropdownMenuItem
            key={restaurant.id}
            onClick={() => switchRestaurant(restaurant.id)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{restaurant.name}</span>
            {restaurant.id === currentRestaurant.id && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Restaurant
            </DropdownMenuItem>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Restaurant</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Restaurant Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="New Restaurant"
                />
              </div>
              <Button onClick={handleCreate} disabled={isCreating || !newName.trim()}>
                {isCreating ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
