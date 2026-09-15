import sys
import re

def main():
    with open('src/server/api.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix SSRF in /proxy/image
    # Replace:
    #   if (!imageUrl || !imageUrl.startsWith('http')) {
    #     return res.status(400).send('Некорректный URL изображения');
    #   }
    
    ssrf_check = """
  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).send('Некорректный URL изображения');
  }
  
  try {
    const urlObj = new URL(imageUrl);
    const hostname = urlObj.hostname;
    // Basic SSRF protection
    if (
      hostname === 'localhost' || 
      hostname === '127.0.0.1' || 
      hostname.startsWith('10.') || 
      hostname.startsWith('192.168.') || 
      hostname.startsWith('172.') ||
      hostname.startsWith('169.254.') ||
      hostname.includes('::') || 
      hostname.includes('unix')
    ) {
      return res.status(403).send('Доступ к локальным адресам запрещен');
    }
  } catch (err) {
    return res.status(400).send('Невалидный URL');
  }
"""

    if "Basic SSRF protection" not in content:
        content = content.replace("""  if (!imageUrl || !imageUrl.startsWith('http')) {
    return res.status(400).send('Некорректный URL изображения');
  }""", ssrf_check.strip())
        print("Patched SSRF in /proxy/image")
    else:
        print("SSRF already patched")

    with open('src/server/api.ts', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    main()
