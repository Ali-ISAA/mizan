import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  status: string;
  overall_score: number | null;
  created_at: string;
}

export function useProject(projectId: string) {
  return useQuery<ProjectDetail>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}`);
      return data;
    },
  });
}
