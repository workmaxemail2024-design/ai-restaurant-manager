import { useState } from 'react';
import { PageLayout } from '@/components/common/PageLayout';
import { RequirePermission } from '@/components/RequirePermission';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Play, Pause, Settings2, Code, History, Zap } from 'lucide-react';
import {
  useAutomationRules,
  useAutomationRuleRuns,
  useCreateAutomationRule,
  useUpdateAutomationRule,
  useDeleteAutomationRule,
  useToggleAutomationRule,
  TRIGGER_TYPES,
  CONDITION_FIELDS,
  ACTION_TYPES,
  RUN_FREQUENCIES,
  AutomationRule,
  AutomationCondition,
  AutomationAction,
} from '@/hooks/useAutomation';
import { formatDistanceToNow } from 'date-fns';

function ConditionBuilder({ 
  conditions, 
  onChange 
}: { 
  conditions: AutomationCondition[]; 
  onChange: (conditions: AutomationCondition[]) => void;
}) {
  const addCondition = () => {
    onChange([...conditions, { field: 'ingredient.quantity', operator: '<', value: 10 }]);
  };

  const updateCondition = (index: number, updates: Partial<AutomationCondition>) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    onChange(newConditions);
  };

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Conditions</Label>
        <Button type="button" variant="outline" size="sm" onClick={addCondition}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>
      {conditions.map((condition, index) => (
        <div key={index} className="flex gap-2 items-center">
          <Select
            value={condition.field}
            onValueChange={(v) => updateCondition(index, { field: v })}
          >
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_FIELDS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={condition.operator}
            onValueChange={(v) => updateCondition(index, { operator: v as AutomationCondition['operator'] })}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="<">&lt;</SelectItem>
              <SelectItem value=">">&gt;</SelectItem>
              <SelectItem value="==">=</SelectItem>
              <SelectItem value="<=">&le;</SelectItem>
              <SelectItem value=">=">&ge;</SelectItem>
              <SelectItem value="!=">&ne;</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={condition.value}
            onChange={(e) => updateCondition(index, { value: parseFloat(e.target.value) || 0 })}
            className="w-24"
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => removeCondition(index)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      {conditions.length === 0 && (
        <p className="text-sm text-muted-foreground">No conditions - rule will always fire on trigger</p>
      )}
    </div>
  );
}

function ActionBuilder({ 
  actions, 
  onChange 
}: { 
  actions: AutomationAction[]; 
  onChange: (actions: AutomationAction[]) => void;
}) {
  const addAction = () => {
    onChange([...actions, { type: 'send_notification', config: { title: '', message: '', level: 'info' } }]);
  };

  const updateAction = (index: number, updates: Partial<AutomationAction>) => {
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], ...updates };
    onChange(newActions);
  };

  const removeAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  const renderActionConfig = (action: AutomationAction, index: number) => {
    switch (action.type) {
      case 'send_notification':
        return (
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Input
              placeholder="Title"
              value={(action.config.title as string) || ''}
              onChange={(e) => updateAction(index, { config: { ...action.config, title: e.target.value } })}
            />
            <Select
              value={(action.config.level as string) || 'info'}
              onValueChange={(v) => updateAction(index, { config: { ...action.config, level: v } })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Message"
              className="col-span-2"
              value={(action.config.message as string) || ''}
              onChange={(e) => updateAction(index, { config: { ...action.config, message: e.target.value } })}
            />
          </div>
        );
      case 'create_purchase_order':
        return (
          <div className="mt-2">
            <Input
              type="number"
              placeholder="Quantity multiplier"
              value={(action.config.quantity_multiplier as number) || 1}
              onChange={(e) => updateAction(index, { config: { ...action.config, quantity_multiplier: parseFloat(e.target.value) || 1 } })}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Actions</Label>
        <Button type="button" variant="outline" size="sm" onClick={addAction}>
          <Plus className="h-3 w-3 mr-1" /> Add
        </Button>
      </div>
      {actions.map((action, index) => (
        <div key={index} className="border border-border rounded-lg p-3">
          <div className="flex gap-2 items-center">
            <Select
              value={action.type}
              onValueChange={(v) => updateAction(index, { type: v, config: {} })}
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="icon" onClick={() => removeAction(index)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
          {renderActionConfig(action, index)}
        </div>
      ))}
      {actions.length === 0 && (
        <p className="text-sm text-muted-foreground">Add at least one action</p>
      )}
    </div>
  );
}

function RuleForm({ 
  rule, 
  onSave, 
  onCancel 
}: { 
  rule?: AutomationRule; 
  onSave: (data: Partial<AutomationRule>) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    name: rule?.name || '',
    description: rule?.description || '',
    is_active: rule?.is_active ?? true,
    trigger: rule?.trigger || { type: 'stock_level_changed' },
    conditions: rule?.conditions || [],
    actions: rule?.actions || [],
    run_frequency: rule?.run_frequency || 'realtime',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Rule Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Trigger</Label>
            <Select
              value={formData.trigger.type}
              onValueChange={(v) => setFormData({ ...formData, trigger: { ...formData.trigger, type: v } })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Run Frequency</Label>
            <Select
              value={formData.run_frequency}
              onValueChange={(v) => setFormData({ ...formData, run_frequency: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RUN_FREQUENCIES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <ConditionBuilder
        conditions={formData.conditions}
        onChange={(conditions) => setFormData({ ...formData, conditions })}
      />

      <ActionBuilder
        actions={formData.actions}
        onChange={(actions) => setFormData({ ...formData, actions })}
      />

      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div className="flex items-center gap-2">
          <Switch
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
          />
          <Label>Active</Label>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="submit">Save Rule</Button>
        </div>
      </div>
    </form>
  );
}

function RuleCard({ rule }: { rule: AutomationRule }) {
  const [editing, setEditing] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const toggleRule = useToggleAutomationRule();
  const updateRule = useUpdateAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const { data: runs = [] } = useAutomationRuleRuns(showRuns ? rule.id : undefined);

  const handleSave = (data: Partial<AutomationRule>) => {
    updateRule.mutate({ id: rule.id, ...data });
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">{rule.name}</CardTitle>
              <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                {rule.is_active ? 'Active' : 'Inactive'}
              </Badge>
              <Badge variant="outline">{rule.run_frequency}</Badge>
            </div>
            <CardDescription className="mt-1">{rule.description}</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleRule.mutate({ id: rule.id, is_active: !rule.is_active })}
            >
              {rule.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setEditing(true)}>
              <Settings2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => deleteRule.mutate(rule.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong>Trigger:</strong> {TRIGGER_TYPES.find(t => t.value === rule.trigger.type)?.label || rule.trigger.type}</p>
          <p><strong>Conditions:</strong> {rule.conditions.length || 'None'}</p>
          <p><strong>Actions:</strong> {rule.actions.map(a => ACTION_TYPES.find(t => t.value === a.type)?.label || a.type).join(', ')}</p>
          {rule.last_run && (
            <p><strong>Last run:</strong> {formatDistanceToNow(new Date(rule.last_run), { addSuffix: true })}</p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowRuns(!showRuns)}>
            <History className="h-3 w-3 mr-1" />
            {showRuns ? 'Hide History' : 'View History'}
          </Button>
        </div>

        {showRuns && runs.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <h4 className="text-sm font-medium mb-2">Recent Runs</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {runs.slice(0, 5).map((run) => (
                <div key={run.id} className="flex items-center justify-between text-xs">
                  <Badge variant={run.status === 'success' ? 'default' : 'destructive'}>
                    {run.status}
                  </Badge>
                  <span className="text-muted-foreground">{run.message}</span>
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Rule</DialogTitle>
            </DialogHeader>
            <RuleForm rule={rule} onSave={handleSave} onCancel={() => setEditing(false)} />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default function AutomationRulesPage() {
  const [creating, setCreating] = useState(false);
  const { data: rules = [], isLoading } = useAutomationRules();
  const createRule = useCreateAutomationRule();

  const handleCreate = (data: Partial<AutomationRule>) => {
    createRule.mutate(data as any);
    setCreating(false);
  };

  return (
    <RequirePermission resource="automation" action="view">
      <PageLayout 
        title="Automation Rules" 
        subtitle="Create automated workflows to streamline your operations"
      >
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{rules.length} rules</Badge>
            <Badge variant="outline">{rules.filter(r => r.is_active).length} active</Badge>
          </div>
          <RequirePermission resource="automation" action="admin" fallback={null}>
            <Dialog open={creating} onOpenChange={setCreating}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Rule
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Automation Rule</DialogTitle>
                </DialogHeader>
                <RuleForm onSave={handleCreate} onCancel={() => setCreating(false)} />
              </DialogContent>
            </Dialog>
          </RequirePermission>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Zap className="h-8 w-8 animate-pulse text-muted-foreground" />
          </div>
        ) : rules.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Zap className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No automation rules yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first automation rule to streamline operations
              </p>
              <RequirePermission resource="automation" action="admin" fallback={null}>
                <Button onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Rule
                </Button>
              </RequirePermission>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {rules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} />
            ))}
          </div>
        )}
      </PageLayout>
    </RequirePermission>
  );
}
