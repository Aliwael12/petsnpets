import jwt from 'jsonwebtoken';

/**
 * Issues an operator token for a verification run.
 *
 * These suites used to sign in with the seed PIN "1234", which only works against a freshly
 * seeded local database. Run against the clinic's real one — where the PINs belong to actual
 * people and are not ours to know — every login came back 401 and the whole suite failed for
 * a reason that had nothing to do with the code under test.
 *
 * Minting the session directly is the same thing AuthService.pinLogin does after it verifies
 * the PIN: one operator_sessions row plus a signed token. What is skipped is only the PIN
 * check itself, which these suites were never about.
 */
export async function tokenFor(sql, employeeId, deviceId) {
  const [session] = await sql`
    insert into operator_sessions (employee_id, device_id, expires_at)
    values (${employeeId}, ${deviceId}, now() + interval '1 hour')
    returning id`;
  return jwt.sign(
    { sub: employeeId, sessionId: session.id, deviceId },
    process.env.OPERATOR_JWT_SECRET,
    { expiresIn: '1h' },
  );
}

/**
 * The first active employee holding a role, with a token — looked up by ROLE, never by name,
 * because a name is display text real users edit.
 *
 * Returns null when the clinic has nobody in that role, so a caller can skip rather than
 * fail: a small clinic legitimately has no nurse.
 */
export async function actorWithRole(sql, role, deviceId) {
  const [employee] = await sql`
    select id, name, role from employees where role = ${role} and active order by created_at limit 1`;
  if (!employee) return null;
  return { ...employee, token: await tokenFor(sql, employee.id, deviceId) };
}

/** Drops every session a suite opened. Call it in both the success and failure paths. */
export async function cleanupSessions(sql, deviceId) {
  await sql`delete from operator_sessions where device_id = ${deviceId}`.catch(() => {});
}
