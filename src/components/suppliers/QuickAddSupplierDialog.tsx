import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateSupplier } from "@/hooks/useSuppliers";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialName?: string;
  /** Called with the new supplier id so the calling form can auto-select it. */
  onCreated: (supplierId: string) => void;
}

/** Minimal supplier creation using the existing Suppliers architecture. */
export function QuickAddSupplierDialog({ open, onOpenChange, initialName, onCreated }: Props) {
  const createSupplier = useCreateSupplier();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (open) {
      setName(initialName || "");
      setContactName("");
      setPhone("");
      setEmail("");
    }
  }, [open, initialName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const created = await createSupplier.mutateAsync({
      name: name.trim(),
      contact_name: contactName.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
    });
    if (created?.id) onCreated(created.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Quick add supplier</DialogTitle>
          <DialogDescription>
            Creates the supplier in your existing Suppliers list and selects it here.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="qs-name">Supplier name</Label>
            <Input id="qs-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div>
            <Label htmlFor="qs-contact">Contact name (optional)</Label>
            <Input id="qs-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qs-phone">Phone (optional)</Label>
              <Input id="qs-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="qs-email">Email (optional)</Label>
              <Input id="qs-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createSupplier.isPending || !name.trim()}>Create &amp; use</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
