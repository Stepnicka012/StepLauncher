const fakeUsers = [
    {
        id: "u123",
        email: "admin@nova.com",
        password: "1234",
        username: "NovaAdmin",
        premium: true
    },
    {
        id: "u456",
        email: "user@test.com",
        password: "abcd",
        username: "JugadorPro",
        premium: false
    }
];

export async function loginUser(email: string, password: string) {
    return new Promise((resolve) => {
        setTimeout(() => {
            if (!email || !password) {
                return resolve({
                    success: false,
                    message: "Email o contraseña vacíos.",
                    data: null
                });
            }
            const user = fakeUsers.find(
                u => u.email.toLowerCase() === email.toLowerCase()
            );
            if (!user) {
                return resolve({
                    success: false,
                    message: "El usuario no existe.",
                    data: null
                });
            }
            if (user.password !== password) {
                return resolve({
                    success: false,
                    message: "Contraseña incorrecta.",
                    data: null
                });
            }
            resolve({
                success: true,
                message: "Sesión iniciada correctamente.",
                data: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    premium: user.premium,
                    token: crypto.randomUUID()
                }
            });

        }, 750);
    });
}
