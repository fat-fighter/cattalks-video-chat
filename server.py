import json
import bcrypt

from flask_pymongo import PyMongo
from flask import Flask, render_template, url_for, request, session, redirect


app = Flask(__name__)

app.config["MONGO_DBNAME"] = "cattalks"
app.config["MONGO_URI"] = "mongodb://127.0.0.1:27017/cattalks"

mongo = PyMongo(app)


@app.route("/")
def index():
    if "username" in session:
        return "You are logged in as " + session["username"] + "<a href='/logout'>Logout</a>"

    if "login" in request.args:
        return render_template(
            "login.html", login="failed"
        )

    return render_template("login.html")


@app.route("/logout")
def logout():
    session.clear()

    return redirect(url_for("index"))


@app.route("/login", methods=["POST"])
def login():
    users = mongo.db.users
    login_user = users.find_one({"username": request.form["username"]})

    if login_user:
        hashed_pass = bcrypt.hashpw(
            request.form["pass"].encode("utf-8"),
            login_user["password"].encode("utf-8")
        )
        if hashed_pass == login_user["password"].encode("utf-8"):
            session["username"] = request.form["username"]
            return redirect(url_for("index"))

    return redirect(url_for("index", login="failed"))


@app.route("/register", methods=["POST", "GET"])
def register():
    if request.method == "POST":
        users = mongo.db.users
        existing_user = users.find_one({"username": request.form["username"]})

        if existing_user is None:
            hashpass = bcrypt.hashpw(
                request.form["pass"].encode("utf-8"), bcrypt.gensalt())
            users.insert({
                "name": request.form["name"],
                "username": request.form["username"],
                "password": hashpass
            })
            session["username"] = request.form["username"]
            return redirect(url_for("index"))

        return render_template("register.html", register="failed")

    return render_template("register.html")


if __name__ == "__main__":
    app.secret_key = "mysecret"
    app.run(debug=True)
