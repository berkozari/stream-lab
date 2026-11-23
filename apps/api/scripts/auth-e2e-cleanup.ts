import { prisma } from '../src/config/database.js';

const email = process.argv[2];
const expected =
  /^streamlab-e2e-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@example\.invalid$/u;

if (!email || !expected.test(email)) {
  throw new Error(
    'Cleanup refused: expected an exact streamlab-e2e-<uuid>@example.invalid address',
  );
}

try {
  const account = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (account) {
    await prisma.$transaction(async (tx) => {
      // Foreign keys are Restrict: delete this test account's descendants first.
      await tx.consumedRefreshToken.deleteMany({ where: { session: { userId: account.id } } });
      await tx.authSession.deleteMany({ where: { userId: account.id } });
      await tx.user.delete({ where: { id: account.id } });
    });
  }
  console.log(`PASS: E2E cleanup completed for ${email}`);
} finally {
  await prisma.$disconnect();
}
