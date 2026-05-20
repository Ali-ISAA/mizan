import { BarChart3, FileText, Shield, Upload, Settings, Home, History } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const items = [
  { title: 'Dashboard', url: '/', icon: Home },
  { title: 'Upload Document', url: '/upload', icon: Upload },
  { title: 'My Documents', url: '/documents', icon: FileText },
  { title: 'Compliance Rules', url: '/rules', icon: Shield },
  { title: 'Reports & Analytics', url: '/reports', icon: BarChart3 },
  { title: 'Activity Log', url: '/activity', icon: History },
  { title: 'Settings', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  const { data: analytics } = useQuery({
    queryKey: ["analytics-sidebar"],
    queryFn: () => api.get("/analytics").then(r => r.data),
    staleTime: 60_000,
  });
  const avgScore: number = analytics?.overview?.avg_score ?? 0;
  const scoreColor = avgScore >= 80 ? "text-success" : avgScore >= 60 ? "text-warning" : "text-critical";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent
        className="relative"
        style={{
          background: 'var(--gradient-sidebar)',
        }}
      >
        {/* Header */}
        <div className="h-20 px-4 border-b border-sidebar-border/50 flex items-center group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:justify-center">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center w-full">
            <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 group-data-[collapsible=icon]:h-14 group-data-[collapsible=icon]:w-14">
              <img
                src="/mizan-logo.png"
                alt="Mizan"
                className="h-full w-full object-contain object-center"
              />
            </div>
            <div className="group-data-[collapsible=icon]:hidden leading-none">
              <h2 className="text-base font-semibold text-sidebar-foreground tracking-tight leading-tight">
                Mizan AI
              </h2>
              <p className="text-xs text-sidebar-foreground/60 font-medium leading-tight mt-0.5">
                Compliance Platform
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <SidebarGroup className="px-3 py-4 group-data-[collapsible=icon]:px-0">
          <SidebarGroupLabel className="px-3 text-xs uppercase tracking-wider text-sidebar-foreground/50 font-semibold mb-2">
            Navigation
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {items.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className={`
                          flex items-center gap-3 rounded-lg px-3 py-2.5
                          group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:mx-auto
                          transition-all duration-200
                          group relative
                          ${active
                            ? 'bg-sidebar-accent text-accent-600 font-medium shadow-sm'
                            : 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/40'
                          }
                        `}
                      >
                        {active && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent-600 rounded-r-full" />
                        )}
                        <item.icon
                          className={`
                            h-4 w-4 flex-shrink-0 transition-all duration-200
                            ${active
                              ? 'text-accent-600 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                              : 'group-hover:scale-110'
                            }
                          `}
                        />
                        <span className="text-sm group-data-[collapsible=icon]:hidden">
                          {item.title}
                        </span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Bottom Compliance Score Card */}
        <div className="mt-auto p-4 border-t border-sidebar-border/50">
          <div className="rounded-lg bg-sidebar-accent/30 backdrop-blur-sm p-3.5 group-data-[collapsible=icon]:hidden border border-sidebar-border/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-sidebar-foreground/70">
                Overall Compliance
              </p>
              <span className={`text-sm font-semibold ${scoreColor}`}>{avgScore}%</span>
            </div>
            <div className="relative h-2 bg-primary-900 rounded-full overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 bg-gradient-to-r rounded-full transition-all duration-500 ${
                  avgScore >= 80 ? "from-success to-success/80" : avgScore >= 60 ? "from-warning to-warning/80" : "from-critical to-critical/80"
                }`}
                style={{ width: `${avgScore}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              </div>
            </div>
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
