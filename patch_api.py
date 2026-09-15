import sys

def main():
    with open('src/server/api.ts', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Fix FRIENDS_ONLY bug
    content = content.replace("=== 'FRIENDS_ONLY'", "=== 'FRIENDS'")
    content = content.replace("eq(tierLists.visibility, 'FRIENDS_ONLY')", "eq(tierLists.visibility, 'FRIENDS')")

    # 2. Fix telegramChatId IDOR in PUT /auth/profile
    # It looks like:
    # telegramChatId: telegramChatId !== undefined ? telegramChatId : user.telegramChatId,
    content = content.replace("telegramChatId: telegramChatId !== undefined ? telegramChatId : user.telegramChatId,", "")
    content = content.replace("telegramChatId,\n    } = req.body;", "} = req.body;")

    # 3. Add block check to POST /messages
    # Find:
    #     if (!receiver) {
    #       return res.status(404).json({ error: 'Получатель не найден' });
    #     }
    # 
    # Insert check after this.
    
    block_check = """
    if (!receiver) {
      return res.status(404).json({ error: 'Получатель не найден' });
    }

    // BLOCK CHECK
    const blockedCheck = await db
      .select()
      .from(friendRequests)
      .where(
        or(
          and(eq(friendRequests.senderId, user.id), eq(friendRequests.receiverId, rId), eq(friendRequests.status, 'BLOCKED')),
          and(eq(friendRequests.senderId, rId), eq(friendRequests.receiverId, user.id), eq(friendRequests.status, 'BLOCKED'))
        )
      )
      .limit(1);

    if (blockedCheck.length > 0) {
      return res.status(403).json({ error: 'Вы не можете отправить сообщение этому пользователю' });
    }
"""
    
    if "const blockedCheck =" not in content:
        content = content.replace("""    if (!receiver) {
      return res.status(404).json({ error: 'Получатель не найден' });
    }""", block_check.strip())

    # 4. Remove duplicated admin routes
    # From: apiRouter.get('/admin/dashboard'
    # To: apiRouter.post('/admin/telegram-test', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => { ... })
    # This is quite large. We can find the start of the duplicated admin routes and delete until they end.
    
    start_str = "apiRouter.get('/admin/dashboard', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {"
    end_str_trigger = "apiRouter.post('/admin/telegram-test'"
    
    if start_str in content and end_str_trigger in content:
        start_idx = content.find(start_str)
        
        # Find the end of telegram-test
        end_idx_start = content.find(end_str_trigger)
        # We need to find the closing brackets of this route
        
        # Just use a simple bracket counter or string find to find the end of the route
        search_idx = end_idx_start
        brace_count = 0
        started = False
        
        while search_idx < len(content):
            if content[search_idx] == '{':
                brace_count += 1
                started = True
            elif content[search_idx] == '}':
                brace_count -= 1
                
            if started and brace_count == 0:
                # Need to match the closing '});'
                search_idx += 1
                if content[search_idx:search_idx+2] == ');':
                    search_idx += 2
                break
                
            search_idx += 1
            
        print(f"Removing duplicated admin routes from {start_idx} to {search_idx}")
        content = content[:start_idx] + "\n// Duplicated admin routes removed\n" + content[search_idx:]
    else:
        print("Could not find start/end of duplicated admin routes")

    with open('src/server/api.ts', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    main()
