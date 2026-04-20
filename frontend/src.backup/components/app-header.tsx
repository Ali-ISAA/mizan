import { Bell, Search, User, Moon, Sun, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";

export function AppHeader() {
  const { theme, setTheme } = useTheme();
  const { userEmail, logout } = useAuth();

  // Get initials from email
  const getInitials = (email: string | null) => {
    if (!email) return "U";
    const name = email.split("@")[0];
    return name.substring(0, 2).toUpperCase();
  };

  // Get display name from email
  const getDisplayName = (email: string | null) => {
    if (!email) return "User";
    const name = email.split("@")[0];
    return name
      .split(/[._-]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center gap-4 px-6">
        {/* Sidebar Toggle */}
        <SidebarTrigger className="transition-all duration-200 hover:bg-surface rounded-lg" />

        {/* Search Bar - Centered */}
        <div className="flex flex-1 items-center justify-center gap-4">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted transition-colors" />
            <Input
              placeholder="Search documents, rules, or compliance data..."
              className="pl-10 pr-4 h-10 bg-surface border-border hover:border-accent-600 focus:border-accent-600 transition-all"
            />
          </div>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="rounded-lg hover:bg-surface transition-all duration-200"
          >
            <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>

          {/* Notifications */}
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-lg hover:bg-surface transition-all duration-200"
          >
            <Bell className="h-[1.2rem] w-[1.2rem]" />
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-critical text-[10px] font-semibold text-white shadow-glow-critical">
              3
            </span>
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full hover:ring-2 hover:ring-accent-600/20 transition-all duration-200"
              >
                <Avatar className="h-9 w-9 border-2 border-border">
                  <AvatarImage src="/avatars/01.png" alt="@username" />
                  <AvatarFallback className="bg-gradient-to-br from-accent-600 to-accent-700 text-white font-semibold text-sm">
                    {getInitials(userEmail)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-64 bg-surface-elevated border-border shadow-xl rounded-lg"
              align="end"
              forceMount
            >
              <DropdownMenuLabel className="font-normal p-3">
                <div className="flex flex-col space-y-1.5">
                  <p className="text-sm font-semibold leading-none text-foreground">
                    {getDisplayName(userEmail)}
                  </p>
                  <p className="text-xs leading-none text-text-muted">
                    {userEmail || "user@company.com"}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <div className="p-1">
                <DropdownMenuItem className="rounded-md cursor-pointer transition-colors hover:bg-surface">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-md cursor-pointer transition-colors hover:bg-surface">
                  Billing
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-md cursor-pointer transition-colors hover:bg-surface">
                  Team
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-md cursor-pointer transition-colors hover:bg-surface">
                  Subscription
                </DropdownMenuItem>
              </div>
              <DropdownMenuSeparator className="bg-border" />
              <div className="p-1">
                <DropdownMenuItem
                  className="rounded-md cursor-pointer transition-colors hover:bg-critical/10 hover:text-critical"
                  onClick={logout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
