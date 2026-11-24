import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { videoKeys } from './video.keys';
import { videoUploadGateway } from '../services/video-upload-gateway';
import { xhrPutTransport } from '../services/video-upload-xhr';
import {
  createVideoUploadFlow,
  isAbort,
  type UploadFile,
  type UploadProgress,
  type UploadSession,
} from '../services/video-upload-flow';

function message(error: unknown): string {
  if (error instanceof Error && !('response' in error)) return error.message;
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  switch (status) {
    case 401:
      return 'Oturum geçersiz. Yeniden giriş yapmalısın.';
    case 404:
      return 'Upload oturumu bulunamadı veya erişim izni yok.';
    case 409:
      return 'Upload durumu değişmiş. Devam etmeyi veya sayfayı yenilemeyi dene.';
    case 410:
      return 'Upload oturumu sona ermiş. Yeni taslakta tekrar dene.';
    case 422:
      return 'Dosya boyutu, türü veya içeriği sunucuda doğrulanamadı.';
    case 429:
      return 'Çok fazla istek gönderildi. Daha sonra tekrar dene.';
    default:
      return 'Yükleme tamamlanamadı. Ağ bağlantısını ve storage CORS ayarlarını kontrol et.';
  }
}

export function useVideoUpload(videoId: string, onCompleted?: () => void) {
  const { user } = useAuth();
  const ownerId = user?.id;
  const queryClient = useQueryClient();
  const flow = useMemo(
    () =>
      ownerId
        ? createVideoUploadFlow({
            ownerId,
            gateway: videoUploadGateway,
            transport: xhrPutTransport,
            storage: (() => {
              try {
                return typeof window !== 'undefined' ? window.localStorage : undefined;
              } catch {
                return undefined;
              }
            })(),
          })
        : null,
    [ownerId],
  );
  const [saved, setSaved] = useState<UploadSession | null>(() => flow?.read(videoId) ?? null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const activePromise = useRef<Promise<void> | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    return () => {
      runId.current += 1;
      controller.current?.abort();
    };
  }, [flow, videoId]);

  const begin = useCallback(
    (file: UploadFile, resume: boolean) => {
      if (!flow || activePromise.current) return;
      const id = ++runId.current;
      const abort = new AbortController();
      controller.current = abort;
      setBusy(true);
      setError(null);
      const task = flow
        .run({
          videoId,
          file,
          resume,
          signal: abort.signal,
          onProgress: (value) => {
            if (runId.current === id) setProgress(value);
          },
        })
        .then(async () => {
          if (runId.current !== id) return;
          setSaved(null);
          await queryClient.invalidateQueries({ queryKey: videoKeys.all });
          onCompleted?.();
        })
        .catch((failure: unknown) => {
          if (runId.current !== id) return;
          if (!isAbort(failure)) setError(message(failure));
          setSaved(flow.read(videoId));
        })
        .finally(() => {
          if (runId.current !== id) return;
          controller.current = null;
          activePromise.current = null;
          setBusy(false);
        });
      activePromise.current = task;
    },
    [flow, onCompleted, queryClient, videoId],
  );

  const pause = useCallback(() => controller.current?.abort(), []);
  const cancel = useCallback(async () => {
    if (!flow) return;
    controller.current?.abort();
    await activePromise.current;
    setBusy(true);
    setError(null);
    try {
      await flow.abortMultipart(videoId);
      setSaved(null);
      setProgress(null);
      await queryClient.invalidateQueries({ queryKey: videoKeys.all });
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }, [flow, queryClient, videoId]);

  return {
    saved,
    progress,
    error,
    busy,
    start: (file: UploadFile) => begin(file, false),
    resume: (file: UploadFile) => begin(file, true),
    pause,
    cancel,
  };
}
