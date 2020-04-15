var express = require("express");
var app = express();
var bodyParser = require("body-parser");
var multer = require("multer");
//var upload = multer();
var session = require("express-session");
var ejs = require("ejs");
var path = require("path");
const cookieParser = require("cookie-parser");
var crypto = require("crypto");
var nodemailer = require("nodemailer");
var bcrypt = require("bcrypt");
const saltRounds = 10;
const { Pool } = require("pg");
var _ = require("lodash");

//Store cookies containing session id on client's browser
app.use(cookieParser());
//Session
app.use(
  session({
    secret: "oneplus 6",
    saveUninitialized: true,
    resave: true,
  })
);

//Set storage engine image uploads
const storage = multer.diskStorage({
  destination: "./public/images",
  filename: function (req, file, cb) {
    cb(null, file.fieldname + Date.now() + path.extname(file.originalname));
  },
});

//Init image upload
const upload = multer({
  storage: storage,
  limits: { fileSize: 1000000 },
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  },
}).single("upImg");

//Check File type
function checkFileType(file, cb) {
  // allowed ext
  const fileTypes = /jpeg|jpg|png|gif/;
  //Check ext
  const extName = fileTypes.test(path.extname(file.originalname).toLowerCase());
  // Check mime
  const mimeType = fileTypes.test(file.mimetype);

  if (mimeType && extName) {
    return cb(null, true);
  } else {
    cb("Error : Images only!!!!!!");
  }
}

app.set("view engine", "ejs");
app.set("views", "./public/views");

//for parsing application json
app.use(bodyParser.json());

//for parsing application/xwww-
app.use(bodyParser.urlencoded({ extended: false }));
//form-urlencoded

//for parsing multipart/form-data
//app.use(upload.array());
app.use(express.static("public"));

const db = new Pool({
  user: "postgres",
  host: "localhost",
  database: "user",
  password: "123456",
  port: 5432,
});

// function to check previous aborted session to continue
function sessionChecker(req, res, next) {
  var sess = req.session;
  if (sess.username) {
    res.redirect("/homepage");
  } else {
    next();
  }
}
//------------------------------------------------------------------------------------------------
// displaying the start page index.ejs
app.get("/", sessionChecker, function (req, res) {
  res.render("index");
});

//------------------------------------------------------------------------------------------------
// showing registration page
app.get("/signup", sessionChecker, function (req, res) {
  res.render("signup");
});

// handling submit on signup Page
app.post("/signup", function (req, res) {
  var user = req.body;
  var sess = req.session;
  bcrypt.hash(user.password, saltRounds, function (err, hash) {
    var pass = hash;
    const query = {
      text:
        'INSERT INTO "user"(username, name, email_id, password, contact, location, year) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      values: [
        user.username,
        user.name,
        user.email,
        pass,
        user.contact,
        user.location,
        user.branchYear,
      ],
    };

    db.query(query, function (err) {
      if (err) {
        console.log(err);
        res.render("signup", {
          msg: "Username not available. Try another username.",
        });
      } else {
        res.redirect("login");
      }
    });
  });
});

app.get("/verify", function (req, res) {
  var sess = req.session;
  if (sess.username) {
    (async () => {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        // first try to get the email address of user
        const queryEmail = {
          text: 'SELECT email_id FROM "user" WHERE username = $1',
          values: [sess.username],
        };
        const emailResp = await client.query(queryEmail);
        const email = emailResp.rows[0].email_id;

        // once email address found try emailing
        // if emailing failed show error
        var cipherKey = crypto.createCipher("aes128", "satviFail");
        var str = cipherKey.update(sess.username, "utf8", "hex");
        str += cipherKey.final("hex");
        var link = "http://localhost:3000/verify/" + str;
        var transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: "tempV.Store@gmail.com",
            pass: "tgmSPAN@V4",
          },
        });
        var mailOptions = {
          from: "tempV.Store@gmail.com",
          to: email,
          subject: "Verfication of email on VStore",
          html:
            "<h4>Hello!</h4><p>Just one step away from email verfication!<br>Click <a href = " +
            link +
            ">here </a>to complete the process</p>",
        };
        //  var sent = false;
        transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
            // some error
            console.log(error);
            throw new Error("Email not sent");
          } else {
            console.log("Sent Mail!");
          }
        });
        res.render("verify", {
          username: sess.username,
          msg: "Email is sent please check your email address: " + email,
        });
        await client.query("COMMIT");
      } catch (err) {
        console.log(err);
        res.render("verify", {
          username: sess.username,
          msg: "Verification email not sent! Try again",
        });
      } finally {
        client.release();
      }
    })().catch((err) => console.log(err.stack));
  } else {
    res.redirect("/login");
  }
});

app.get("/verify/:user", function (req, res) {
  var sess = req.session;
  console.log("Sess" + sess.username + " " + req.params.user);
  if (sess.username) {
    var user = req.params.user;
    var decipherKey = crypto.createDecipher("aes128", "satviFail");
    var username = decipherKey.update(user, "hex", "utf8");
    username += decipherKey.final("utf8");
    console.log("username" + username);
    if (sess.username == username) {
      // email is verified for user
      const query = {
        text: 'UPDATE "user" SET active = true WHERE username = $1',
        values: [sess.username],
      };
      db.query(query, function (err) {
        if (err) {
          // database error so send msg Not Verified
          console.log(err);
          res.render("verify", {
            username: sess.username,
            msg: "Verification not done. Try Again",
          });
        } else {
          sess.active = true;
          res.render("verify", {
            username: sess.username,
            msg: "Verification Done",
            done: "Yes",
          });
        }
      });
    } else {
      res.render("verify", {
        username: sess.username,
        msg: "Verification Error. Try again.",
      });
    }
  } else {
    res.redirect("/login");
  }
});

//----------------------------------------------------------------------------------------------------
// displaying login page
app.get("/login", sessionChecker, function (req, res) {
  res.render("login");
});

app.get("/logout", function (req, res) {
  var sess = req.session;
  if (sess.username) {
    req.session.destroy();
  }
  res.redirect("/login");
});

// handling submit on login page
app.post("/login", function (req, res) {
  var sess = req.session;
  var user = req.body;

  // query definition
  const query = {
    text: 'SELECT password,active FROM "user" WHERE username = $1 ',
    values: [user.username],
    rowMode: "array",
  };

  // making the query
  db.query(query, function (err, resp) {
    if (err) {
      res.render("login", {
        msg: "Invalid username and password",
      });
    } else {
      try {
        bcrypt.compare(user.password, resp.rows[0][0].toString(), function (
          erro,
          result
        ) {
          if (result) {
            sess.username = user.username;
            sess.active = resp.rows[0][1];
            res.redirect("/homepage");
          } else {
            res.render("login", {
              msg: "Wrong password",
            });
          }
        });
      } catch (e) {
        res.render("Login", {
          msg: "Invalid Username",
        });
      }
    }
  });
});

//-------------------------------------------------------------------------------------------------
// display homepage
app.get("/homepage", function (req, res) {
  var sess = req.session;
  if (sess.username) {
    // someone is logged in and thus can access this page

    const query = {
      text: 'SELECT product_name,price,years_of_usage,product_image,product_id,category FROM "product"',
      rowMode: "array",
    };

    db.query(query, function (err, resp) {
      var product = resp.rows;
      if (err) {
        res.send("Error");
      } else {
        res.render("homepage", {
          product: product,
          username: sess.username,
        });
      }
    });
  } else {
    res.redirect("/login");
  }
});

// to sort for a particular category of product
app.get("/homepage/:category", function (req, res) {
  var sess = req.session;
  var category = req.params.category;
  var query;
  if (sess.username) {
    if (category == "calculator" || category == "pc") {
      query = {
        text:
          'SELECT product_name,price,condition,product_image,product_id FROM "product" WHERE "product".product_id IN (SELECT product_id FROM "pc" UNION SELECT product_id FROM "calculator")',
        rowMode: "array",
      };
    } else {
      query = {
        text:
          'SELECT product_name,price,condition,product_image,product_id FROM "product" WHERE "product".product_id IN (SELECT product_id FROM ' +
          category +
          ");",
        rowMode: "array",
      };
    }
    var searchmsg = "";
    switch (category) {
      case "book":
        searchmsg = "Search Book by Name, Author, Subject...";
        break;
      case "notes":
        searchmsg = "Search Notes by Subject, Professor, year...";
        break;
      case "clothing":
        searchmsg = "Search by Name, Subject...";
        break;
      case "electronics":
        searchmsg = "Search by Name, Type, Brand...";
        break;
      case "other":
        searchmsg = "Search by Name";
        break;
    }
    db.query(query, function (err, resp) {
      var product = resp.rows;
      if (err) {
        res.send("Error");
      } else {
        res.render("search", {
          product: product,
          username: sess.username,
          category: category,
          heading: "Recommended products for you",
          searchmsg: searchmsg,
        });
      }
    });
  } else {
    res.redirect("/login");
  }
});

//-------------------------------------------------------------------------------------------------------
//display product page
app.get("/product/:id", function (req, res) {
  var sess = req.session;
  if (sess.username) {
    var product_id = req.params.id;
    (async () => {
      const client = await db.connect();

      try {
        await client.query("BEGIN");
        const productCategoryQuery = {
          text:
            'SELECT "category" FROM "product" WHERE product_id = $1',
          values: [product_id],
          rowMode: "array",
        };
        const CategoryResp = await client.query(productCategoryQuery);
        const category = CategoryResp.rows;

        switch (category[0][0]) {
          case "books":
            productUserQuery = {
              text: 'SELECT * FROM "bookview" WHERE product_id = $1',
              values: [product_id],
              rowMode: "array",
            };
            break;
          case "clothing":
            productUserQuery = {
              text:'SELECT * FROM "clothview" WHERE product_id = $1',
              values: [product_id],
              rowMode: "array",
            };
            break;
          case "notes":
            productUserQuery = {
              text:'SELECT * FROM "notesview" WHERE product_id = $1',
              values: [product_id],
              rowMode: "array",
            };
            break;
          case "other":
            productUserQuery = {
              text:'SELECT * FROM "otherview" WHERE product_id = $1',
              values: [product_id],
              rowMode: "array",
            };
            break;
          case "calculators":
            productUserQuery = {
              text:'SELECT * FROM "calcview" WHERE product_id = $1',
              values: [product_id],
              rowMode: "array",
            };
            break;
          case "pcs":
            productUserQuery = {
              text:'SELECT * FROM "pcview" WHERE product_id = $1',
              values: [product_id],
              rowMode: "array",
              };
              break;
        }
        const productResp = await client.query(productUserQuery);
        const details = productResp.rows;

        const commentQuery = {
          text:
            'SELECT username, content FROM "comments" WHERE "comments".product_id = $1',
          values: [product_id],
          rowMode: "array",
        };
        const commentResp = await client.query(commentQuery);
        const comments = commentResp.rows;
        res.render("product", {
          user: sess.username,
          category: category,
          details: details,
          comments: comments,
        });
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    })().catch((err) => console.log(err.stack));
  } else {
    res.redirect("/login");
  }
});

//comment post on product page
app.post("/product/:id", function (req, res) {
  var sess = req.session;
  var product_id = req.params.id;
  var comment = req.body.comment;

  if (sess.username) {
    const query = {
      text:
        'INSERT INTO "comments" (username, product_id, content) VALUES ($1,$2,$3)',
      values: [sess.username, product_id, comment],
    };

    db.query(query, function (err, resp) {
      if (err) {
        res.send("Error");
      } else {
        res.redirect("/product/" + product_id);
      }
    });
  } else {
    res.redirect("/login");
  }
});

//----------------------------------------------------------------------------------------------------
// add to cart clicked on homepage or product page
app.get("/cart/:id", function (req, res) {
  var sess = req.session;
  var product_id = req.params.id;
  if (sess.username) {
    // somone is logged in thus can access
    const query = {
      text: 'INSERT INTO "cart" VALUES ($1,$2) ',
      values: [sess.username, product_id],
    };

    db.query(query, function (err, resp) {
      res.redirect("/cart");
    });
  } else {
    res.redirect("/login");
  }
});

// get the cart page
app.get("/cart", function (req, res) {
  var sess = req.session;
  if (sess.username) {
    const query = {
      text:
        'SELECT * FROM "product" INNER JOIN "user" ON("product".product_id, "user".username) IN ( SELECT product_id, seller_id FROM "product" WHERE "product".product_id IN( SELECT "cart".product_id FROM "cart" WHERE username = $1 ))',
      values: [sess.username],
      rowMode: "array",
    };

    db.query(query, function (err, resp) {
      var details = resp.rows;
      if (err) {
        res.send("Error");
      } else {
        res.render("cart", { details: details, user: sess.username });
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/cart/:action/:product", function (req, res) {
  var sess = req.session;
  var action = req.params.action;
  var product_id = req.params.product;
  if (sess.username) {
    // if action = 1 means buy from cart and 0 means remove from cart.

    if (action == 1) {
      // buy selected in cart on product_id
      if (sess.active) {
        // maybe send buy request to seller with buyer(i.e. user details) via email. And notify Buyer that request is sent.
      } else {
        res.render("verify", {
          username: sess.username,
        });
      }
      res.send("Request sent to seller!!");
    } else {
      // remove selected in cart on product_id
      const query = {
        text: 'DELETE FROM "cart" WHERE username = $1 AND product_id = $2',
        values: [sess.username, product_id],
      };

      db.query(query, function (err, resp) {
        if (err) {
          res.send("Error");
        } else {
          res.redirect("/cart");
        }
      });
    }
  } else {
    res.redirect("/login");
  }
});

//----------------------------------------------------------------------------------------------------
//display profile of any user
app.get("/profile/:username", function (req, res) {
  var sess = req.session;
  var currentusername = req.params.username;
  if (sess.username) {
    // somone is logged in thus can access
    const query = {
      text: 'SELECT * FROM "user" WHERE username = $1',
      values: [currentusername],
      rowMode: "array",
    };
    db.query(query, function (err, resp) {
      var currentuser = resp.rows;
      if (err) {
        res.send("Error");
      } else {
        res.render("profile", {
          currentuser: currentuser,
          username: sess.username,
          active: sess.active,
        });
      }
    });
  } else {
    res.redirect("/login");
  }
});

//Edit profile page of logged in user only
app.get("/editprofile", function (req, res) {
  var sess = req.session;
  if (sess.username) {
    // somone is logged in thus can access
    const query = {
      text: 'SELECT * FROM "user" WHERE username = $1',
      values: [sess.username],
      rowMode: "array",
    };
    db.query(query, function (err, resp) {
      var currentuser = resp.rows;
      if (err) {
        res.send("Error");
      } else {
        res.render("editprofile", {
          currentuser: currentuser,
          username: sess.username,
        });
      }
    });
  } else {
    res.redirect("/login");
  }
});

//Updating values in database
app.post("/editprofile", function (req, res) {
  var sess = req.session;
  var details = req.body;
  if (sess.username) {
    // somone is logged in thus can access
    const query = {
      text:
        'UPDATE "user" SET name = $1, email_id = $2, contact = $3, location = $4, year = $5 WHERE username = $6',
      values: [
        details.name,
        details.email,
        details.contact,
        details.location,
        details.year,
        sess.username,
      ],
    };
    db.query(query, function (err, resp) {
      if (err) {
        res.send("Error");
        console.log(err);
      } else {
        res.redirect("/profile/" + sess.username);
      }
    });
  } else {
    res.redirect("/login");
  }
});

//---------------------------------------------------------------------------------------------------------------
//search
/*
app.post("/homepage", function (req, res) {
  var sess = req.session;
  var lowerproductname = _.toLower([(string = req.body.productname)]);
  //console.log(lowerproductname);
  if (sess.username) {
    // somone is logged in thus can access
    const query = {
      text:
        'SELECT name,price,description,image,product_id FROM "product" WHERE LOWER(name) LIKE \'%' +
        lowerproductname + '%\'',
      //values: [lowerproductname],
      rowMode: "array",
    };

    db.query(query, function (err, resp) {
      if (err) {
        res.send("Error");
        console.log(err);
      } else {
        var product = resp.rows;
        res.render("homepage", {
          product: product,
          username: sess.username,
        });
      }
    });
  } else {
    res.redirect("/login");
  }
});
*/
//---------------------------------------------------------------------------------------------
app.get("/sellproduct", function (req, res) {
  var sess = req.session;
  if (sess.username) {
    if (sess.active) {
      res.render("sellproduct", {
        user: sess.username,
      });
    } else {
      res.render("verify", {
        username: sess.username,
      });
    }
  } else {
    res.redirect("/login");
  }
});

app.post("/productUpload", function (req, res) {
  var sess = req.session;
  upload(req, res, function (err) {
    var product = req.body;
    if (err) {
      res.render("sellproduct", {
        msg: err,
        user: sess.username,
      });
    } else {
      if (req.file == undefined) {
        res.render("sellproduct", {
          msg: "No file selected",
          user: sess.username,
        });
      } else {
        const imgPath = `../images/${req.file.filename}`;
        (async () => {
          const client = await db.connect();

          try {
            await client.query("BEGIN");
            const productTableInsertQuery = {
              text:
                "INSERT INTO product (product_name,years_of_usage,price,product_image,condition,seller_id,category) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING product_id",
              values: [
                product.name,
                product.years,
                product.price,
                imgPath,
                product.condition,
                sess.username,
                product.categoryOptions
              ]
            };
            const productResp = await client.query(productTableInsertQuery);
            var product_id = productResp.rows[0].product_id;
            console.log(product_id);
            var category = product.categoryOptions;
            var query;

            switch (category) {
              case "books":
                query = {
                  text: 'INSERT INTO "book" VALUES ($1,$2,$3,$4,$5)',
                  values: [
                    product_id,
                    product.publication,
                    product.edition,
                    product.subject,
                    product.author,
                  ],
                };
                break;
              case "clothing":
                query = {
                  text: 'INSERT INTO "clothing" VALUES ($1,$2,$3,$4)',
                  values: [
                    product_id,
                    product.size,
                    product.type,
                    product.color
                  ]
                };
                break;
              case "notes":
                query = {
                  text: 'INSERT INTO "notes" VALUES ($1,$2,$3,$4,$5)',
                  values: [
                    product_id,
                    product.n_subject,
                    product.topic,
                    product.professor,
                    product.year
                  ]
                };
                break;
              case "other":
                query = {
                  text: 'INSERT INTO "other" VALUES ($1,$2,$3)',
                  values: [product_id, product.description, product.cate]
                };
                break;
              case "calculators":
                query = {
                  text: 'INSERT INTO "calculator" VALUES ($1,$2,$3,$4)',
                  values: [
                    product_id,
                    product.calcibrand,
                    product.model,
                    product.features
                  ]
                };
                break;
              case "pcs":
                  query = {
                    text: 'INSERT INTO "pc" VALUES ($1,$2,$3,$4,$5,$6)',
                    values: [
                      product_id,
                      product.os,
                      product.ram,
                      product.storage,
                      product.pcbrand,
                      product.processor
                    ]
                  };
                  break;
            }

            await client.query(query);
            res.render("sellproduct", {
              msg: "Successfully added the product.",
              user: sess.username,
            });
            await client.query("COMMIT");
          } catch (err) {
            await client.query("ROLLBACK");
            //console.log(err);
            res.render("sellproduct", {
              msg: "Please fill out all fields!!",
              user: sess.username,
            });
          } finally {
            client.release();
          }
        })().catch((err) => console.log(err.stack));
      }
    }
  });
});

app.use(function (req, res) {
  res.send(404);
});

app.listen(3000, function () {
  console.log("Running on port 3000");
});
