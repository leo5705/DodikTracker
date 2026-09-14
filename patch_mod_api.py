import os

FILE = 'src/server/routes/admin/moderation.ts'
with open(FILE, 'r') as f:
    code = f.read()

old_code = """    const [updated] = await db
      .update(reports)
      .set({
        status,
        moderatorId: actor.id,
        moderatorComment: moderatorComment || null,
        updatedAt: new Date(),
      })"""

new_code = """    const isResolved = status === 'RESOLVED' || status === 'DISMISSED';
    const [updated] = await db
      .update(reports)
      .set({
        status,
        moderatorId: actor.id,
        moderatorComment: moderatorComment || null,
        resolvedAt: isResolved ? new Date() : null,
        updatedAt: new Date(),
      })"""

code = code.replace(old_code, new_code)
with open(FILE, 'w') as f:
    f.write(code)
