// Pilot test accounts (fictional identities, no real student data), shared by
// setup-accounts.mjs and check-signin.mjs. `guide` covers the topics/languages listed.
export const ACCOUNTS = [
  { email: 'student1@bellspace-pilot.test', first_name: 'Sam', role: 'student' },
  { email: 'student2@bellspace-pilot.test', first_name: 'Riley', role: 'student' },
  { email: 'guide1@bellspace-pilot.test', first_name: 'Gina', role: 'guide',
    guide: { topics: ['navigation', 'new_student', 'clubs', 'other'], languages: ['en', 'es'] } },
  { email: 'editor@bellspace-pilot.test', first_name: 'Ed', role: 'admin' },
];

/** Find an auth user by email with the service-role (secret key) client. */
export async function findUser(admin, email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email === email);
    if (user || data.users.length < 200) return user ?? null;
  }
  return null;
}
