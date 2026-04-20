import { Settings as SettingsIcon, User, Bell, Shield, Database, Download, Moon, Sun } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/hooks/use-theme";

const Settings = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex-1 space-y-8 p-8 animate-fade-in">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-text-secondary mt-2 text-base">
          Configure your account preferences and system settings.
        </p>
      </div>

      <div className="grid gap-6 max-w-4xl">
        {/* Profile Settings */}
        <Card className="border-border shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600/10">
                <User className="h-5 w-5 text-accent-600" />
              </div>
              Profile Settings
            </CardTitle>
            <CardDescription className="text-text-secondary">
              Manage your account information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-sm font-medium text-foreground">
                Full Name
              </Label>
              <Input id="name" defaultValue="John Doe" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </Label>
              <Input id="email" type="email" defaultValue="john.doe@company.com" />
            </div>
            <Button className="mt-2">Save Changes</Button>
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card className="border-border shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600/10">
                <Moon className="h-5 w-5 text-accent-600" />
              </div>
              Appearance
            </CardTitle>
            <CardDescription className="text-text-secondary">
              Customize the look and feel
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium text-foreground">Theme</Label>
                <p className="text-sm text-text-secondary">Choose your preferred theme</p>
              </div>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      Light
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      Dark
                    </div>
                  </SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="border-border shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600/10">
                <Bell className="h-5 w-5 text-accent-600" />
              </div>
              Notifications
            </CardTitle>
            <CardDescription className="text-text-secondary">
              Configure notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5 flex-1">
                <Label className="text-sm font-medium text-foreground">
                  Email Notifications
                </Label>
                <p className="text-sm text-text-secondary">
                  Receive compliance alerts via email
                </p>
              </div>
              <Switch defaultChecked />
            </div>

            <Separator className="bg-border" />

            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5 flex-1">
                <Label className="text-sm font-medium text-foreground">
                  Critical Issues
                </Label>
                <p className="text-sm text-text-secondary">
                  Immediate alerts for critical compliance issues
                </p>
              </div>
              <Switch defaultChecked />
            </div>

            <Separator className="bg-border" />

            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5 flex-1">
                <Label className="text-sm font-medium text-foreground">
                  Weekly Reports
                </Label>
                <p className="text-sm text-text-secondary">
                  Summary of compliance status every week
                </p>
              </div>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* System */}
        <Card className="border-border shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600/10">
                <Database className="h-5 w-5 text-accent-600" />
              </div>
              System
            </CardTitle>
            <CardDescription className="text-text-secondary">
              System and data management
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5 flex-1">
                <Label className="text-sm font-medium text-foreground">
                  Data Retention
                </Label>
                <p className="text-sm text-text-secondary">
                  Automatically delete old analysis data
                </p>
              </div>
              <Select defaultValue="90">
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator className="bg-border" />

            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5 flex-1">
                <Label className="text-sm font-medium text-foreground">
                  Export Data
                </Label>
                <p className="text-sm text-text-secondary">
                  Download all your compliance data
                </p>
              </div>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
