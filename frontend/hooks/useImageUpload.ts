import React, { useState, useEffect, useCallback, useRef } from 'react';

/** Maximum file size: 5MB (matches server-side limit for base64 payloads) */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

/** Supported MIME types for vision input */
const SUPPORTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];

interface ImageUploadState {
  /** Base64-encoded image data (without data URI prefix) */
  selectedImage: string | null;
  /** MIME type of the selected image */
  selectedMime: string | null;
  /** Object URL for preview rendering */
  imagePreviewUrl: string | null;
  /** Whether a drag operation is active over the drop zone */
  isDragging: boolean;
}

/**
 * Manages image upload state for vision-enabled chat.
 * Supports file picker, drag-and-drop, and paste.
 * Validates file type and size before processing.
 *
 * @example
 * const { selectedImage, selectedMime, imagePreviewUrl, isDragging, ...handlers } = useImageUpload();
 */
export function useImageUpload() {
  const [state, setState] = useState<ImageUploadState>({
    selectedImage: null,
    selectedMime: null,
    imagePreviewUrl: null,
    isDragging: false,
  });

  // Track drag enter/leave depth to handle nested elements
  const dragCounterRef = useRef(0);

  // Clean up object URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (state.imagePreviewUrl) URL.revokeObjectURL(state.imagePreviewUrl);
    };
  }, [state.imagePreviewUrl]);

  /**
   * Validates and processes a file into base64 for the Gemini vision API.
   * Returns early with user feedback if the file is invalid.
   */
  const processFile = useCallback((file: File) => {
    // MIME type validation
    if (!SUPPORTED_MIME_TYPES.includes(file.type)) {
      alert(`Unsupported file type: ${file.type}. Supported: PNG, JPG, WebP, GIF, HEIC.`);
      return;
    }

    // Size validation
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      alert(`File is ${sizeMB}MB. Maximum size is ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      if (!base64) {
        console.error('Failed to extract base64 from FileReader result');
        return;
      }

      setState(prev => {
        // Revoke previous preview URL to prevent memory leak
        if (prev.imagePreviewUrl) URL.revokeObjectURL(prev.imagePreviewUrl);
        return {
          selectedImage: base64,
          selectedMime: file.type,
          imagePreviewUrl: URL.createObjectURL(file),
          isDragging: false,
        };
      });
    };

    reader.onerror = () => {
      console.error('FileReader error:', reader.error);
      alert('Failed to read the file. Please try again.');
    };

    reader.readAsDataURL(file);
  }, []);

  /** Handle file input change (from file picker button) */
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input value so the same file can be re-selected
    if (e.target) e.target.value = '';
  }, [processFile]);

  /** Handle drag over — prevent default to enable drop */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /** Handle drag enter — increment counter and show overlay */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setState(prev => ({ ...prev, isDragging: true }));
    }
  }, []);

  /** Handle drag leave — decrement counter, hide overlay when fully left */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setState(prev => ({ ...prev, isDragging: false }));
    }
  }, []);

  /** Handle drop — process the first image file */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setState(prev => ({ ...prev, isDragging: false }));

    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  /** Handle paste — extract image from clipboard */
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          processFile(file);
          return;
        }
      }
    }
  }, [processFile]);

  /** Clear the selected image and free resources */
  const clearAttachment = useCallback(() => {
    setState(prev => {
      if (prev.imagePreviewUrl) URL.revokeObjectURL(prev.imagePreviewUrl);
      return {
        selectedImage: null,
        selectedMime: null,
        imagePreviewUrl: null,
        isDragging: false,
      };
    });
  }, []);

  return {
    selectedImage: state.selectedImage,
    selectedMime: state.selectedMime,
    imagePreviewUrl: state.imagePreviewUrl,
    isDragging: state.isDragging,
    handleFileChange,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handlePaste,
    clearAttachment,
    processFile,
  };
}
