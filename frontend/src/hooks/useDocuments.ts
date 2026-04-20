import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Document {
  id: string;
  role: 'requirement' | 'compliance';
  filename: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  page_count: number | null;
  word_count: number | null;
}

export function useProjectDocuments(projectId: string) {
  return useQuery<Document[]>({
    queryKey: ['documents', projectId],
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}/documents`);
      return data;
    },
    refetchInterval: 3000,
  });
}

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      role,
      file,
    }: {
      projectId: string;
      role: string;
      file: File;
    }) => {
      const formData = new FormData();
      formData.append('role', role);
      formData.append('file', file);
      const { data } = await api.post(`/projects/${projectId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documents', variables.projectId] });
    },
  });
}

export function useAnalyze() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { data } = await api.post(`/projects/${projectId}/analyze`);
      return data;
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
}
