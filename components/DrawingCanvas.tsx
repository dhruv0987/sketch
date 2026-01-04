import React, { useRef, useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { DrawingCanvasRef, Point } from '../types';

interface DrawingCanvasProps {
  strokeColor?: string;
  strokeWidth?: number;
  disabled?: boolean;
}

const DrawingCanvas = forwardRef<DrawingCanvasRef, DrawingCanvasProps>(({ 
  strokeColor = '#000000', 
  strokeWidth = 4,
  disabled = false
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPoint, setLastPoint] = useState<Point | null>(null);
  // Track if canvas is empty to avoid sending blank images
  const hasDrawnRef = useRef(false);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Fill with white background (important for AI vision)
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      hasDrawnRef.current = false;
    },
    getDataUrl: () => {
      const canvas = canvasRef.current;
      return canvas ? canvas.toDataURL('image/png') : '';
    },
    getOptimizedDataUrl: () => {
      const canvas = canvasRef.current;
      if (!canvas) return '';

      // Create a temporary canvas to resize/compress
      const tempCanvas = document.createElement('canvas');
      const MAX_SIZE = 800; // Cap max dimension to 800px
      let width = canvas.width;
      let height = canvas.height;

      if (width > height) {
        if (width > MAX_SIZE) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
      }

      tempCanvas.width = width;
      tempCanvas.height = height;
      const ctx = tempCanvas.getContext('2d');
      
      if (ctx) {
        // 1. Fill white (handles any transparency issues)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        // 2. Draw scaled image
        ctx.drawImage(canvas, 0, 0, width, height);
        
        // 3. Return as JPEG (smaller, faster, AI-friendly)
        return tempCanvas.toDataURL('image/jpeg', 0.8);
      }
      
      return canvas.toDataURL('image/jpeg', 0.8);
    },
    isEmpty: () => !hasDrawnRef.current
  }));

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const parent = canvas?.parentElement;
      if (canvas && parent) {
        // Save current content
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        
        // FIX: Ensure valid dimensions before drawing to avoid InvalidStateError
        if (canvas.width > 0 && canvas.height > 0) {
             tempCtx?.drawImage(canvas, 0, 0);
        }

        // Resize
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;

        // Restore context settings
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth;
          
          // Refill background white if it was cleared
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Restore content
          // FIX: Ensure valid dimensions before restoring
          if (tempCanvas.width > 0 && tempCanvas.height > 0) {
            ctx.drawImage(tempCanvas, 0, 0);
          }
        }
      }
    };

    window.addEventListener('resize', handleResize);
    // Initial size
    handleResize();
    
    // Initial white fill
    const canvas = canvasRef.current;
    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }

    return () => window.removeEventListener('resize', handleResize);
  }, [strokeColor, strokeWidth]);

  const getPoint = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault(); // Prevent scrolling on touch
    const point = getPoint(e);
    if (point) {
      setIsDrawing(true);
      setLastPoint(point);
      hasDrawnRef.current = true;
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const currentPoint = getPoint(e);

    if (canvas && ctx && currentPoint && lastPoint) {
      ctx.beginPath();
      ctx.moveTo(lastPoint.x, lastPoint.y);
      ctx.lineTo(currentPoint.x, currentPoint.y);
      ctx.stroke();
      setLastPoint(currentPoint);
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    setLastPoint(null);
  };

  return (
    <div className="w-full h-full relative overflow-hidden rounded-xl shadow-inner bg-white touch-none cursor-crosshair">
      <canvas
        ref={canvasRef}
        className="block touch-none"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
    </div>
  );
});

DrawingCanvas.displayName = 'DrawingCanvas';

export default DrawingCanvas;