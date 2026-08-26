import { forwardRef, useState, useEffect } from 'react'
import { isPoseReadyForLogin } from '@/lib/face-api'
import { PoseType } from '../FaceLogin'

interface VideoDisplayProps {
  isStreaming: boolean
  isModelLoading: boolean
  currentDetectedPose: 'front' | 'left' | 'right' | 'unknown'
  currentPose: { type: PoseType; title: string; instruction: string; icon: string } | undefined
  poseConfidence: number
}

export const VideoDisplay = forwardRef<HTMLVideoElement, VideoDisplayProps>(
  ({ isStreaming, isModelLoading, currentDetectedPose, currentPose, poseConfidence }, ref) => {
    const [aspectRatio, setAspectRatio] = useState<number | null>(null);

    useEffect(() => {
      const videoEl = typeof ref === 'function' ? null : ref?.current;
      if (!videoEl) return;

      const updateAspect = () => {
        if (videoEl.videoWidth && videoEl.videoHeight) {
          setAspectRatio(videoEl.videoWidth / videoEl.videoHeight);
        }
      };

      videoEl.addEventListener('loadedmetadata', updateAspect);
      videoEl.addEventListener('resize', updateAspect);
      if (videoEl.videoWidth && videoEl.videoHeight) {
        updateAspect();
      }

      return () => {
        videoEl.removeEventListener('loadedmetadata', updateAspect);
        videoEl.removeEventListener('resize', updateAspect);
      };
    }, [ref, isStreaming]);

    return (
      <div className="relative mb-6 flex justify-center">
        <div 
          className="bg-gray-900 rounded-lg overflow-hidden w-full max-h-[60vh] transition-all duration-300 relative flex items-center justify-center"
          style={{ aspectRatio: aspectRatio ? `${aspectRatio}` : '16/9' }}
        >
          <video
            ref={ref}
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
            autoPlay
            muted
            playsInline
          />
          
          {isStreaming && !isModelLoading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`border-4 rounded-full w-40 h-52 sm:w-48 sm:h-60 max-w-[70%] max-h-[70%] transition-colors duration-300 ${
                currentPose && isPoseReadyForLogin(currentDetectedPose, currentPose.type, poseConfidence)
                  ? 'border-green-400 animate-pulse shadow-lg shadow-green-400/50'
                  : 'border-purple-400'
              }`} />
            </div>
          )}

          <div className="absolute top-4 left-4 pointer-events-none">
            <div className={`flex items-center space-x-2 px-3 py-2 rounded-full text-sm ${
              isStreaming ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-500' : 'bg-red-500'}`} />
              <span>{isStreaming ? 'กล้องเปิดอยู่' : 'กล้องปิด'}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }
)

VideoDisplay.displayName = 'VideoDisplay'