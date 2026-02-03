import { useState } from 'react';
import { useRestaurant } from '@/contexts/RestaurantContext';
import { useQueryClient } from '@tanstack/react-query';
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
import { Building2, ChevronDown, Plus, Check, Loader2, Pencil } from 'lucide-react';

export function RestaurantSwitcher() {
  const { currentRestaurant, userRestaurants, switchRestaurant, createRestaurant, updateRestaurant, isSwitching } = useRestaurant();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editName, setEditName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSwitch = async (restaurantId: string) => {
    if (restaurantId === currentRestaurant?.id) return;
    await switchRestaurant(restaurantId);
    // Invalidate all queries to refetch data for the new restaurant
    queryClient.invalidateQueries();
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setIsCreating(true);
    await createRestaurant(newName.trim());
    setNewName('');
    setIsCreateOpen(false);
    setIsCreating(false);
  };

  const handleEdit = async () => {
    if (!editName.trim() || !currentRestaurant) return;
    setIsUpdating(true);
    const success = await updateRestaurant(currentRestaurant.id, editName.trim());
    if (success) {
      setIsEditOpen(false);
    }
    setIsUpdating(false);
  };

  const openEditDialog = () => {
    if (currentRestaurant) {
      setEditName(currentRestaurant.name);
      setIsEditOpen(true);
    }
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
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2" disabled={isSwitching}>
            {isSwitching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Building2 className="h-4 w-4" />
            )}
            <span className="max-w-[150px] truncate">{currentRestaurant.name}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-popover z-[100]">
          {userRestaurants.map((restaurant) => (
            <DropdownMenuItem
              key={restaurant.id}
              onClick={() => handleSwitch(restaurant.id)}
              className="flex items-center justify-between"
              disabled={isSwitching}
            >
              <span className="truncate">{restaurant.name}</span>
              {restaurant.id === currentRestaurant.id && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); openEditDialog(); }}>
            <Pencil className="h-4 w-4 mr-2" />
            Rename Restaurant
          </DropdownMenuItem>
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

      {/* Edit Restaurant Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Restaurant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Restaurant Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Restaurant name"
              />
            </div>
            <Button onClick={handleEdit} disabled={isUpdating || !editName.trim()}>
              {isUpdating ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
