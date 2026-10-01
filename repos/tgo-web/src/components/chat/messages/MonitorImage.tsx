import React from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { replyMonitorApi } from '@/services/replyMonitorApi';
import { ticketsApiService } from '@/services/ticketsApi';
import { toAbsoluteApiUrl } from '@/utils/url';

type Props = {
  monitorMessageId?: string; originalUrl?: string; width?: number; height?: number;
  isStaff?: boolean; mediaStatus?: string; uploading?: boolean;
  uploadProgress?: number; uploadError?: boolean;
};

const MonitorImage: React.FC<Props> = ({
  monitorMessageId = '', originalUrl = '', width = 200, height = 200, isStaff = false,
  mediaStatus, uploading = false, uploadProgress, uploadError = false,
}) => {
  const [resolvedUrl, setResolvedUrl] = React.useState('');
  const [failed, setFailed] = React.useState(mediaStatus === 'missing');
  const [retry, setRetry] = React.useState(0);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const imageUrl = toAbsoluteApiUrl(originalUrl) || resolvedUrl;
  const legacyMissing = mediaStatus === 'missing';
  let displayWidth = width || 200; let displayHeight = height || 200;
  if (displayWidth > 240) { const ratio = 240 / displayWidth; displayWidth = 240; displayHeight = Math.round(displayHeight * ratio); }
  if (displayHeight > 320) { const ratio = 320 / displayHeight; displayHeight = 320; displayWidth = Math.round(displayWidth * ratio); }

  React.useEffect(() => {
    if (originalUrl || !monitorMessageId || legacyMissing) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let objectUrl = '';
    const startedAt = Date.now();
    setFailed(false);
    const resolve = async () => {
      try {
        const result = await replyMonitorApi.resolveMedia([monitorMessageId]);
        const media = result.items[monitorMessageId]?.find((item) => item.status === 'ready');
        if (media) {
          const blob = await ticketsApiService.getAttachmentBlob(media.url);
          if (!cancelled) { objectUrl = URL.createObjectURL(blob); setResolvedUrl(objectUrl); }
          return;
        }
      } catch {
        // The file may arrive after its event; retry for the image/text merge window.
      }
      if (!cancelled && Date.now() - startedAt < 120_000) {
        timer = setTimeout(resolve, Math.min(15_000, 2_000 + (Date.now() - startedAt) / 4));
      } else if (!cancelled) setFailed(true);
    };
    void resolve();
    return () => { cancelled = true; if (timer) clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [legacyMissing, monitorMessageId, originalUrl, retry]);

  return <>
    <div className={`${isStaff ? 'border-blue-200 dark:border-blue-700' : 'border-gray-100 dark:border-gray-700'} relative overflow-hidden rounded-lg border bg-white dark:bg-gray-800 ${imageUrl && !uploading ? 'cursor-zoom-in hover:opacity-95' : 'cursor-default'}`} style={{ width: displayWidth, height: displayHeight }} role="button" aria-label="预览图片" aria-disabled={uploading || !imageUrl} onClick={() => { if (imageUrl && !uploading) setPreviewOpen(true); }}>
      {imageUrl ? <img src={imageUrl} alt="图片" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center bg-gray-100 px-3 text-center text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">{legacyMissing ? '历史图片未留存' : failed ? <button type="button" className="underline" onClick={(event) => { event.stopPropagation(); setRetry((value) => value + 1); }}>图片加载失败，点击重试</button> : '图片处理中'}</div>}
      {uploading && <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">{typeof uploadProgress === 'number' ? `${uploadProgress}%` : '上传中'}</div>}
      {uploadError && <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-400">上传失败</div>}
    </div>
    <Lightbox open={previewOpen} close={() => setPreviewOpen(false)} slides={imageUrl ? [{ src: imageUrl }] : []} index={0} plugins={[Zoom]} controller={{ closeOnBackdropClick: true }} styles={{ container: { zIndex: 2000, backgroundColor: 'rgba(0,0,0,0.85)' } }} />
  </>;
};

export default MonitorImage;
