import json
import bcrypt
import logging

from time import sleep
from sys import stdout

import time

from flask_pymongo import PyMongo
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask import Flask, Response, render_template, url_for, request, session, redirect

app = Flask(__name__)

app.logger.addHandler(logging.StreamHandler(stdout))
app.config['SECRET_KEY'] = 'cattalks'
app.config["MONGO_DBNAME"] = "cattalks"
app.config["MONGO_URI"] = "mongodb://127.0.0.1:27017/cattalks"

mongo = PyMongo(app)
socketio = SocketIO(app)



videoChatlive = {}; # stores the matching pair for the users between which video chat is live

clientsActive = {}; #keep a table for listing which clients are currently active


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


@socketio.on("connect", namespace="/cattalks")
def connect():
    print "client %s connected" % request.sid


@socketio.on("join", namespace="/cattalks")
def join_new_client():
    username = session["username"]

    username = username.encode('ascii', 'ignore')

    app.logger.info(username+" has joined (join callback) into Cat Talks ");

    clientsActive[username] = True;

    join_room(username)


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


@socketio.on("send request", namespace="/cattalks")
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


@socketio.on("accept request", namespace="/cattalks")
def accept_request(username):
    users = mongo.db.users

    user1 = users.find_one({"username": username})
    user2 = users.find_one({"username": session["username"]})

    accept_message_request(user1, user2)

    return {"success": True}


@socketio.on("friends request", namespace="/cattalks")
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


@socketio.on("read request", namespace="/cattalks")
def read_request(username):
    users = mongo.db.users

    user = users.find_one({"username": session["username"]})

    return {
        "success": True,
        "name": user["name"],
        "feed": [] if username not in user["feed"] else user["feed"][username],
        "messages": [] if username not in user["messages"] else user["messages"][username]
    }


@socketio.on("feed request", namespace="/cattalks")
def feed_request():
    users = mongo.db.users

    user = users.find_one({"username": session["username"]})

    return {
        "success": True,
        "feed": user["feed"]
    }


@socketio.on("read receipt", namespace="/cattalks")
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


@socketio.on("send message", namespace="/cattalks")
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

    username1 = username1.encode('ascii', 'ignore')
    username2 = username2.encode('ascii', 'ignore')

    emit(
        "feed request", {"user": username2, "type": "sent", "text": text}, room=username1, namespace="/cattalks"
    )
    emit(
        "feed request", {"user": username1, "type": "recv", "text": text}, room=username2, namespace="/cattalks"
    )

    return {"success": True}

# VIDEO PART added by DEV

@socketio.on('input image', namespace='/cattalks')
def input_message(inp):

    username = session['username'];

    if username in videoChatlive: 
        to_username = videoChatlive[username];
        if to_username in clientsActive:
            emit("video feed",{"data": inp, "message":"Sending the frame of peer"}, room = to_username);
        else:
            emit("video feed",{"data": inp, "message": "Peer disconnected"}, room = username);

            videoChatlive.pop(username);
            if to_username in videoChatlive: # possible that same username , (tricky case , do not handle!)
                videoChatlive.pop(to_username);


@socketio.on('disconnect', namespace='/cattalks')
def disconnect_user():
    username = session['username']

    if username in videoChatlive:
        to_username = videoChatlive[username];
        if to_username in clientsActive:
            emit("video feed",{"data":None , "message": "End video chat"},room = to_username);

        app.logger.info("video chat ended between "+username+" and "+to_username);

        videoChatlive.pop(username);
        if to_username in videoChatlive: # possible that same username , (tricky case , do not handle!)
            videoChatlive.pop(to_username);

    if username in clientsActive:
        clientsActive.pop(username);

    leave_room(username); 

    session.pop('username',None);

    app.logger.info(username+" has exited Cat Talks without logging out ");


@socketio.on('leave', namespace = '/cattalks') # when a client logs out , this event will be sent
def leave_client():

    username = session['username'];

    if username in videoChatlive:
        to_username = videoChatlive[username];
        if to_username in clientsActive:
            emit("video feed",{"data": None ,"message": "End video chat"},room = to_username);

        app.logger.info("video chat ended between "+username+" and "+to_username);
        videoChatlive.pop(username);
        if to_username in videoChatlive: # possible that same username , (tricky case , do not handle!)
            videoChatlive.pop(to_username);

    if username in clientsActive:
        clientsActive.pop(username);

    leave_room(username); 

    app.logger.info(username+" has exited Cat Talks by loggin out gracefully ");

@socketio.on('end video chat', namespace = '/cattalks')
def end_video_chat():

    username = session['username'];

    if username in videoChatlive:
        to_username = videoChatlive[username];
        if(check_alive(to_username)):
            emit("video feed",{"data": None, "message": "End video chat"},room = to_username);
        else:
            emit("video feed",{"data": None, "message": "End video chat"}, room = username);

        app.logger.info("video chat ended between "+username+" and "+to_username);
        if to_username in videoChatlive: # possible that same username , (tricky case , do not handle!)
            videoChatlive.pop(to_username);


@socketio.on('video chat request', namespace='/cattalks')
def video_chat_request(to_username):

    to_username = to_username.encode('ascii','ignore') #to convert from unicode to string
    from_username = session['username'];

    app.logger.info(from_username+" has requested to video chat with"+to_username);

    if to_username not in clientsActive:

        emit('video chat response',{"success":0,"message":'No user currently active with username '+to_username}, room = from_username);
    else:
        if to_username in videoChatlive:
            emit('video chat response',{"success":0,"message":'User : '+to_username+' is busy with another video chat'}, room = from_username);

        if from_username in videoChatlive:
            emit('video chat response',{"success":0,"message":'You are busy with another video chat'}, room = from_username);

        emit('video chat request',{"message":'Are you willing to video chat with '+from_username}, room = to_username);

@socketio.on('video chat response', namespace = '/cattalks')
def video_chat_response(to_username , answer): # maintain the same order as above for these 2 also
    
    from_username = session['username'];
    to_username = to_username.encode('ascii','ignore') #to convert from unicode to string
    answer = answer.encode('ascii','ignore') #to convert from unicode to string

    if answer == 'YES': # if the answer is yes , pair them and show the live feeds to both
        videoChatlive[to_username] = from_username;
        videoChatlive[from_username] = to_username; #remember to clear both when the chat ends(figure this out somehow)
        emit('video chat response',{"success":1,"message":'User with username '+to_username+' accepted your request'}, room = from_username);
    else:
        emit('video chat response',{"success":0,"message":'User with username '+to_username+' did not accepted your request'}, room = from_username);


if __name__ == "__main__":
    # app.run(debug=True, host="0.0.0.0", port=6343)
    socketio.run(app, debug=True, host="127.0.0.1")
    # socketio.run(app, debug=True, host="0.0.0.0", port=6343)
