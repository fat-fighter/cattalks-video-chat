import json
import bcrypt
import logging

from time import sleep
from sys import stdout

from flask_pymongo import PyMongo
from flask_socketio import SocketIO, emit
from flask import Flask, Response, render_template, url_for, request, session, redirect

app = Flask(__name__)

app.logger.addHandler(logging.StreamHandler(stdout))
app.config['SECRET_KEY'] = 'cattalks'
app.config["MONGO_DBNAME"] = "cattalks"
app.config["MONGO_URI"] = "mongodb://127.0.0.1:27017/cattalks"

mongo = PyMongo(app)
socketio = SocketIO(app)


@app.route("/")
def index():
    if "username" in session:
        return render_template("index.html", name=session["name"])

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
            session["name"] = login_user["name"]
            session["username"] = login_user["username"]

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
                "password": hashpass,
                "requests": [],
                "friends": [],
                "messages": {},
                "feed": {}
            })

            session["name"] = request.form["name"]
            session["username"] = request.form["username"]

            return redirect(url_for("index"))

        return render_template("register.html", register="failed")

    return render_template("register.html")


@socketio.on("connect", namespace="/users")
def connect():
    print "client %s connected" % request.sid


def accept_message_request(user1, user2):
    users = mongo.db.users

    username1 = user1["username"]
    username2 = user2["username"]

    feed1 = user1["feed"]
    feed2 = user2["feed"]

    feed1[username2] = [
        {"type": "log", "text": "You are now connected with " + user2["name"]}
    ]
    feed2[username1] = [
        {"type": "log", "text": "You are now connected with " + user1["name"]}
    ]

    requests1 = user1["requests"]
    requests2 = user2["requests"]

    requests1.remove(username2)
    requests2.remove(username1)

    friends1 = user1["friends"]
    friends2 = user2["friends"]

    user1 = users.update(
        {"username": username1}, {
            "$set": {
                "feed": feed1, "requests": requests1, "friends": friends1 + [username2]
            }
        }
    )
    user2 = users.update(
        {"username": username2}, {
            "$set": {
                "feed": feed2, "requests": requests2, "friends": friends2 + [username1]
            }
        }
    )


@socketio.on("send request", namespace="/users")
def send_request(username):
    users = mongo.db.users
    user = users.find_one({"username": username})

    if user is not None:
        req_username = session["username"]
        if req_username == username:
            return {"success": False, "message": "Invalid request"}

        req_user = users.find_one({"username": req_username})

        requests = user["requests"]

        if session["username"] not in requests:
            requests.append(session["username"])

        users.update(
            {"username": username}, {"$set": {"requests": requests}}
        )

        if username in req_user["requests"]:
            accept_message_request(req_user, user)

        return {"success": True, "message": "Successful"}

    else:
        return {"success": False, "message": "User %s does not exist" % username}


@socketio.on("accept request", namespace="/users")
def accept_request(username):
    users = mongo.db.users

    user1 = users.find_one({"username": username})
    user2 = users.find_one({"username": session["username"]})

    accept_message_request(user1, user2)

    return {"success": True}


@socketio.on("friends request", namespace="/users")
def friends_request():
    users = mongo.db.users

    user = users.find_one({"username": session["username"]})

    friends = user["messages"].keys() + user["feed"].keys()
    friends = {
        username: users.find_one({"username": username})["name"]
        for username in friends
    }
    friends

    return {
        "success": True,
        "friends": friends
    }


@socketio.on("read request", namespace="/feed")
def read_request(username):
    users = mongo.db.users

    user = users.find_one({"username": session["username"]})

    return {
        "success": True,
        "name": user["name"],
        "feed": [] if username not in user["feed"] else user["feed"][username],
        "messages": [] if username not in user["messages"] else user["messages"][username]
    }


@socketio.on("read receipt", namespace="/feed")
def read_receipt(username):
    users = mongo.db.users

    user = users.find_one({"username": session["username"]})
    feed = user["feed"]
    messages = user["messages"]

    if username in feed:
        if username not in messages:
            messages[username] = []

        messages[username].extend(feed[username])
        del feed[username]

        users.update(
            {"username": session["username"]}, {
                "$set": {"messages": messages, "feed": feed}
            })

    return {"success": True}


@socketio.on("send message", namespace="/feed")
def send_message(username, text):
    users = mongo.db.users

    username1, username2 = session["username"], username

    user1 = users.find_one({"username": username1})
    user2 = users.find_one({"username": username2})

    if username2 not in user1["friends"] or username1 not in user2["friends"]:
        return {"sucess": False, "message": "Invalid request"}

    feed1 = user1["feed"]
    feed1 = [] if username2 not in feed1 else feed1[username2]

    feed2 = user2["feed"]
    feed2 = [] if username1 not in feed2 else feed2[username1]

    feed1.append({"type": "sent", "text": text})
    feed2.append({"type": "recv", "text": text})

    user1["feed"][username2] = feed1
    user2["feed"][username1] = feed2

    users.update({"username": username1}, {"$set": {"feed": user1["feed"]}})
    users.update({"username": username2}, {"$set": {"feed": user2["feed"]}})

    return {"success": True}


if __name__ == "__main__":
    # app.run(debug=True, host="0.0.0.0", port=6343)
    socketio.run(app, debug=True, host="127.0.0.1")
