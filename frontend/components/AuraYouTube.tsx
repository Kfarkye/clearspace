// ============================================================================
// AuraYouTube — Premium Media Console
// Design: Apple TV / visionOS aesthetic. Embedded player with carousel.
// Features: SWR stream-safe, autoplay, video switching, deep-linking.
// ============================================================================

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayCircle, Video } from 'lucide-react';

// ─── Interfaces & Physics ──────────────────────────────────────────────────

interface YouTubeVideo {
  title: string;
  url: string;
  thumbnail: string;
  author?: string;
  duration?: string;
  videoId?: string;
}

interface YouTubeData {
  videos?: YouTubeVideo[];
  query?: string;
}

const SPRING = { type: 'spring', bounce: 0, duration: 0.5, mass: 0.8, damping: 18 } as const;

/** Extracts the YouTube video ID from a URL or videoId field */
const extractVideoId = (video: YouTubeVideo): string | null => {
  if (video.videoId) return video.videoId;
  if (!video.url) return null;
  try {
    const url = new URL(video.url);
    return url.searchParams.get('v') || url.pathname.split('/').pop() || null;
  } catch {
    // Fallback regex for edge-case URLs
    const match = video.url.match(/(?:v=|\/embed\/|\.be\/)([a-zA-Z0-9_-]{11})/);
    return match?.[1] || null;
  }
};

// ─── Pure Parsing Utility (SWR Stream-Safe) ────────────────────────────────

const parseYouTubeData = (raw: string): YouTubeData | null => {
  if (!raw) return null;
  try {
    const match = raw.match(/```[a-zA-Z_]*\n([\s\S]*?)(?:```|$)/);
    let clean = match ? match[1] : raw;
    clean = clean.trim().replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(clean);
  } catch {
    return null;
  }
};

// ─── Main Component ────────────────────────────────────────────────────────

export const AuraYouTube: React.FC<{ dataString: string }> = ({ dataString }) => {
  const [data, setData] = useState<YouTubeData | null>(null);
  const [mainVideo, setMainVideo] = useState<YouTubeVideo | null>(null);
  const [otherVideos, setOtherVideos] = useState<YouTubeVideo[]>([]);

  useEffect(() => {
    const parsed = parseYouTubeData(dataString);
    if (parsed?.videos && parsed.videos.length > 0) {
      setData(parsed);
      // Only valid videos with extractable IDs
      const valid = parsed.videos.filter(v => extractVideoId(v));
      if (valid.length > 0) {
        setMainVideo(valid[0]);
        setOtherVideos(valid.slice(1));
      }
    }
  }, [dataString]);

  if (!mainVideo) {
    return (
      <div className="my-8 py-5 px-6 bg-black/[0.02] border border-black/[0.04] rounded-[24px] flex items-center justify-center gap-3 w-fit mx-auto">
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}>
          <Video size={16} className="text-black/40" />
        </motion.div>
        <span className="text-[13px] font-medium tracking-tight text-black/50">Searching media...</span>
      </div>
    );
  }

  const mainVideoId = extractVideoId(mainVideo);

  const handleVideoSelect = (video: YouTubeVideo) => {
    setOtherVideos(prev => {
      const newOthers = [mainVideo!, ...prev.filter(v => extractVideoId(v) !== extractVideoId(video))];
      return newOthers;
    });
    setMainVideo(video);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="my-8 w-full max-w-2xl mx-auto font-sans"
    >
      <div className="bg-white/70 backdrop-blur-3xl rounded-[32px] shadow-[0_24px_60px_rgba(0,0,0,0.06),0_0_1px_rgba(0,0,0,0.1)] border border-black/[0.04] overflow-hidden isolate">
        <div className="p-6 sm:p-8">
          {/* ─── Embedded Player ───────────────────────────────── */}
          <div className="relative aspect-video mb-5 rounded-[20px] overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.12)] border border-black/5 bg-black">
            {mainVideoId && (
              <iframe
                key={mainVideoId}
                src={`https://www.youtube.com/embed/${mainVideoId}?autoplay=1&modestbranding=1&rel=0`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute top-0 left-0 w-full h-full"
              />
            )}
          </div>

          {/* ─── Now Playing Info ──────────────────────────────── */}
          <AnimatePresence mode="wait">
            <motion.div
              key={mainVideoId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <h3 className="text-[17px] font-semibold text-[#1D1D1F] tracking-tight leading-snug">
                {mainVideo.title}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                {mainVideo.author && (
                  <span className="text-[13px] font-medium text-black/45">{mainVideo.author}</span>
                )}
                {mainVideo.duration && (
                  <>
                    <span className="text-black/20">·</span>
                    <span className="text-[13px] font-medium text-black/35">{mainVideo.duration}</span>
                  </>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ─── Carousel: More Results ─────────────────────────── */}
        {otherVideos.length > 0 && (
          <>
            <div className="px-6 sm:px-8 mb-4">
              <h4 className="text-[11px] font-bold text-black/30 uppercase tracking-[0.18em] border-b border-black/[0.04] pb-3">
                More Results
              </h4>
            </div>
            <div className="flex gap-4 px-6 sm:px-8 pb-6 sm:pb-8 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {otherVideos.map((video) => {
                const vid = extractVideoId(video);
                return (
                  <motion.div
                    key={vid}
                    onClick={() => handleVideoSelect(video)}
                    className="flex-shrink-0 w-44 cursor-pointer group"
                    whileHover={{ scale: 1.03 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <div className="relative aspect-video rounded-[12px] overflow-hidden shadow-md bg-[#F5F5F7]">
                      {video.thumbnail && (
                        <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      )}
                      <div className="absolute inset-0 bg-black/15 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                        <PlayCircle size={28} className="text-white/80 group-hover:text-white transition-all group-hover:scale-110" strokeWidth={1.5} />
                      </div>
                      {video.duration && (
                        <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 text-[10px] font-bold text-white bg-black/70 rounded-[4px]">
                          {video.duration}
                        </span>
                      )}
                    </div>
                    <div className="mt-2">
                      <p className="text-[12px] font-semibold text-[#1D1D1F]/90 line-clamp-2 leading-tight tracking-tight">{video.title}</p>
                      {video.author && (
                        <p className="text-[11px] text-black/40 mt-0.5">{video.author}</p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ─── YouTube Deep Link ────────────────────────────────── */}
      {data?.query && (
        <div className="mt-4 flex justify-center">
          <a
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(data.query)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 hover:bg-white/80 transition-colors border border-black/5 shadow-sm text-[12px] font-semibold text-black/50 hover:text-black/70"
          >
            <Video size={14} />
            See all results on YouTube
          </a>
        </div>
      )}
    </motion.div>
  );
};
