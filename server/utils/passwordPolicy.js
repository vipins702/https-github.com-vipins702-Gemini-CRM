// One rule for every place a password is chosen (new users, admin resets, change-password, new workspaces).
// Returns a message when the password is not acceptable, otherwise null.
export function passwordProblem(pw) {
    if (typeof pw !== 'string') return 'Password must be text';
    if (pw.length < 8) return 'Password must be at least 8 characters';
    if (pw.length > 128) return 'Password must be 128 characters or fewer';
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain at least one letter and one number';
    return null;
}
