const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt');
const db_access = require('./Db.js')
const db = db_access.db
const cookieParser = require('cookie-parser');
const server = express()
const port = 555
const secret_key = 'hashimaaaaa'
server.use(cors({
    origin:"http://localhost:3000",
    credentials: true
}))
server.use(express.json())
server.use(cookieParser())
const generateToken = (id, isAdmin) => {
    return jwt.sign({ id, isAdmin }, secret_key, { expiresIn: '1h' })
}
const verifyToken = (req, res, next) => {
    const token = req.cookies.authToken
    if (!token)
        return res.status(401).send('unauthorized')
    jwt.verify(token, secret_key, (err, details) => {
        if (err)
            return res.status(403).send('invalid or expired token')
        req.userDetails = details

        next()
    })
}
server.post('/user/login', (req, res) => {
    const email = req.body.email
    const password = req.body.password
    db.get(`SELECT * FROM USER WHERE EMAIL=?  `, [email], (err, row) => {
        bcrypt.compare(password, row.PASSWORD, (err, isMatch) => {
            if (err) {
                return res.status(500).send('error comparing password.')
            }
            if (!isMatch) {
                return res.status(401).send('invalid credentials')
            }
            else {
                let userID = row.ID
                let isAdmin = row.ISADMIN
                const token = generateToken(userID, isAdmin)

                res.cookie('authToken', token, {
                    httpOnly: true,
                    sameSite: 'none',
                    secure:true,
                    expiresIn: '1h'
                })
                return res.status(200).json({ id: userID, admin: isAdmin })
            }
        })
    })
})

server.post(`/user/register`, (req, res) => {
    const name = req.body.name
    const email = req.body.email
    const password = req.body.password
    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
            return res.status(500).send('error hashing password')
        }
        db.run(`INSERT INTO USER (name,email,password,isadmin) VALUES (?,?,?,?)`, [name, email, hashedPassword, 0], (err) => {
            if (err) {

                return res.status(401).send(err)
            }
            else
                return res.status(200).send(`registration successfull`)
        })
    })
})


server.post(`/events/addevent`, verifyToken, (req, res) => {
    const isAdmin = req.userDetails.isAdmin;
    if (isAdmin !== 1)
        return res.status(403).send("you are not an admin")
    const venue = req.body.venue
    const name = req.body.name
    const date = req.body.date
    const quantity = parseInt(req.body.quantity, 10)
    let query = `INSERT INTO EVENT (VENUE,NAME,DATE,QUANTITY) VALUES
    (?,?,?,?)`
    db.run(query, [venue, name, date, quantity], (err) => {
        if (err) {
            console.log(err)
            return res.send(err)
        }
        else {
            return res.send(`event added successfully`)
        }
    })

})

server.get('/checkadmin', verifyToken, (req, res) => {
    res.json({ isAdmin: req.userDetails.isAdmin === 1 });
});

server.get('/events', (req, res) => {
    const query = `SELECT * FROM EVENT WHERE QUANTITY > 0`
    db.all(query, (err, rows) => {
        if (err) {
            console.log(err)
            return res.status(500).send(err)
        }
        res.json(rows)
    })
});

server.get('/myevents', verifyToken, (req, res) => {
    let userId = req.userDetails.id; 

    let query = `SELECT EVENT.* FROM EVENT JOIN BOOKING ON EVENT.ID = BOOKING.EVENT_ID WHERE BOOKING.USER_ID = ?`; 

    db.all(query, [userId], (err, rows) => {
        if (err) {
            console.log("error fetching events", err); 
            return res.status(500).send("something went wrong"); 
        }
        else {
            return res.json(rows); 
        }
    });
});

server.get('/applicants', verifyToken, (req, res) => {
    if (req.userDetails.isAdmin !== 1) {
        return res.status(403).send("Not authorized") 
    }

    let query = `
        SELECT EVENT.NAME as EVENT_NAME, USER.NAME, USER.EMAIL, USER.ID
        FROM BOOKING
        JOIN USER ON USER.ID = BOOKING.USER_ID
        JOIN EVENT ON EVENT.ID = BOOKING.EVENT_ID`; 

    db.all(query, (err, rows) => {
        if (err) {
            console.log("error fetching applicants", err); 
            return res.status(500).send("something went wrong"); 
        }

        let groupedApplicants = {}; 
        for (let row of rows) {
            if (!groupedApplicants[row.EVENT_NAME]) {
                groupedApplicants[row.EVENT_NAME] = []; 
            }
            groupedApplicants[row.EVENT_NAME].push({
                ID: row.ID,
                NAME: row.NAME,
                EMAIL: row.EMAIL
            }); 
        }

        res.json(groupedApplicants); 
    });
});

server.post('/apply', verifyToken, (req, res) => {
    let userId = req.userDetails.id;
    let eventId = req.body.eventId;

    db.get('SELECT QUANTITY FROM EVENT WHERE ID = ?', [eventId], (err, row) => {
        if (err) {
            console.log(err);
            return res.status(500).send("something went wrong");
        }
        if (!row || row.QUANTITY <= 0) {
            return res.status(400).send("no spots available");
        }

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            db.run('INSERT INTO BOOKING (USER_ID, EVENT_ID) VALUES (?,?)', [userId, eventId], (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    console.log(err);
                    return res.status(500).send("booking failed");
                }

                db.run('UPDATE EVENT SET QUANTITY = QUANTITY - 1 WHERE ID = ?', [eventId], (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        console.log(err);
                        return res.status(500).send("update failed");
                    }

                    db.run('COMMIT');
                    res.json({ success: true });
                });
            });
        });
    });
});

server.get(`/events`, verifyToken, (req, res) => {
    let isAdmin = req.userDetails.isAdmin;
    if (isAdmin !== 1) {
        return res.status(403).send("not admin");
    }

    let query = `SELECT * FROM EVENT`;
    db.all(query, (err, rows) => {
        if (err) {
            console.log(err);
            return res.status(500).send("something went wrong");
        }
        res.json(rows);
    });
});


server.put(`/events/edit/:id/:quantity`, verifyToken, (req, res) => {
    const isAdmin = req.userDetails.isAdmin;
    if (isAdmin !== 1)
        return res.status(403).send("you are not an admin")
    const query = `UPDATE EVENT SET QUANTITY=${parseInt(req.params.quantity, 10)}
    WHERE ID=${req.params.id}`

    db.run(query, (err) => {
        if (err) {
            console.log(err)
            return res.send(err)
        }
        else {
            return res.send(`event updated successfully`)
        }
    })
})

server.put(`/book`, verifyToken, (req, res) => {
    const isAdmin = req.userDetails.isAdmin;
    if (isAdmin !== 1)
        return res.status(403).send("you are not an admin")
    let venue = req.query.venue
    let name = req.query.name
    let date = req.query.date
    let query = `SELECT * FROM EVENT WHERE VENUE='${venue}'
    AND NAME='${name}' AND DATE='${date}'`

    db.get(query, (err, row) => {
        if (err) {
            console.log(err)
            return res.send(err)
        }
        else {
            
            let eventID = row.ID
            let userID = req.body.userID
            let query2 = `INSERT INTO BOOKING (USER_ID,EVENT_ID) VALUES (${parseInt(userID, 10)},${eventID})`
            console.log(query2)
            db.run(query2, (err) => {
                if (err) {
                    console.log(err)
                    return res.send(err)
                }
                else {
                    
                    let quantity = parseInt(row.QUANTITY, 10)
                    quantity = quantity - 1
                    query = `UPDATE EVENT SET QUANTITY=${quantity} WHERE ID=${eventID}`
                    console.log(query)
                    db.run(query, (err) => {
                        if (err) {
                            console.log(err)
                            return res.send(err)
                        }
                        else {
                            res.send(`booked successfully`)
                        }
                    })
                }
            })
        }
    })
})

server.post('/user/logout', (req, res) => {
    res.cookie('authToken', '', {
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        expires: new Date(0)
    });
    res.json({ success: true });
});

server.listen(port, () => {
    console.log(`server started at port ${port}`)
    db.serialize(() => {
        db.run(db_access.createUserTable, (err) => {
            if (err)
                console.log("error creating user table " + err)
        });
        db.run(db_access.createEventTable, (err) => {
            if (err)
                console.log("error creating event table " + err)
        });
        db.run(db_access.createBookingTable, (err) => {
            if (err)
                console.log("error creating booking table " + err)
        });
    })
})
