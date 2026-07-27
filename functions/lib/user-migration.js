export async function updateMigratedUser(userRef, { uid, migratedAt }) {
    await userRef.update({
        role: "user",
        authUid: uid,
        migratedAt
    });
}
