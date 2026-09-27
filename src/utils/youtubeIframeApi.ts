declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

let apiPromise: Promise<any> | null = null;

export function loadYouTubeIframeAPI(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube IFrame API can only be loaded in browser environment'));
  }

  if (window.YT && window.YT.Player && typeof window.YT.Player === 'function') {
    return Promise.resolve(window.YT);
  }

  if (apiPromise) {
    return apiPromise;
  }

  apiPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById('youtube-iframe-api');

    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') {
        try {
          previousReady();
        } catch (e) {
          console.error(e);
        }
      }
      if (window.YT && window.YT.Player) {
        resolve(window.YT);
      } else {
        reject(new Error('YouTube IFrame API object missing on ready'));
      }
    };

    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'youtube-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error('Failed to load YouTube IFrame Player API script'));
      };
      document.head.appendChild(script);
    } else {
      let checkCount = 0;
      const checkInterval = setInterval(() => {
        checkCount++;
        if (window.YT && window.YT.Player) {
          clearInterval(checkInterval);
          resolve(window.YT);
        } else if (checkCount > 50) {
          clearInterval(checkInterval);
          reject(new Error('Timeout waiting for YouTube IFrame Player API'));
        }
      }, 100);
    }
  });

  return apiPromise;
}
