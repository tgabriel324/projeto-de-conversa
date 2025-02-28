
import { supabase } from "@/integrations/supabase/client";

// Função para incrementar visualizações
export const incrementVideoViews = async (videoId: string) => {
  try {
    const { error } = await supabase.rpc('increment_views', { video_id: videoId });
    
    if (error) {
      console.error('Erro ao incrementar visualizações:', error);
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Erro ao chamar função RPC:', error);
    return false;
  }
};
