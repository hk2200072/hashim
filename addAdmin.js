const sqlite = require('sqlite3')
const bcrypt = require('bcrypt')
const db = new sqlite.Database('event.db')

bcrypt.hash('admin12345', 10, (err, hashedPassword) => {
    if (err) {
        console.log('Error hashing password:', err)
        return
    }
    db.run(`INSERT INTO USER (name,email,password,isadmin) VALUES (?,?,?,?)`,['Admin', 'admin@gmail.com', hashedPassword, 1],(err) => {
            if (err)
                console.log(err.message)
            else
                console.log('Admin user created successfully')
            db.close()
        })
})