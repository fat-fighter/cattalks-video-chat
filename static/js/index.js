var url;
var active_user;
var user_socket, feed_socket;

let socket_config = {
    upgrade: false,
    transports: ["websocket"]
};

var request_username_input;


function setup_user_socket() {
    user_socket = io.connect(url + "/users", socket_config);
    user_socket.on("connect", function () {
        console.log("Connected to namespace users");
    });
}

function setup_feed_socket() {
    feed_socket = io.connect(url + "/feed", socket_config);
    feed_socket.on("connect", function () {
        console.log("Connected to namespace feed");
    });
}


$(document).ready(function () {
    url = location.protocol + "//" + document.domain + ":" + location.port;

    setup_user_socket();
    setup_feed_socket();

    load_friends();

    request_username_input = document.querySelector("#request-username-input");
});

function load_friends() {
    user_socket.emit("friends request", function (message) {
        if (message.success) {
            let friends_blocks_container = document.querySelector("#friend-blocks-container");

            let friends = message.friends;

            for (var username in friends) {
                friends_blocks_container.innerHTML += `
                    <div class="friend-block" id ="friend-block-` + username + `" onclick="read_messages(this)">
                        <img src="/static/img/cat-profile.png">
                        <span class="">` + friends[username] + `</span>
                    </div>
                `
            }
        }
    });
}

function send_message_request() {
    let username = request_username_input.value;
    if (username != "") {
        user_socket.emit("send request", username, function (message) {
            if (message.success) {
                console.log("Info: " + message.message);
            }
            else {
                console.log("Error: " + message.message);
            }
        });
    }
}


function read_messages(elem) {
    elem.classList.add("active");
    let username = elem.id.split("-")[2];

    if (active_user != null) {
        document.querySelector("#friend-block-" + active_user).classList.remove("active");
    }
    active_user = username;

    feed_socket.emit("read request", username, function (message) {
        if (message.success) {
            let messages_container = document.querySelector("#messages-container");

            messages_container.innerHTML = "";

            for (var index in message.messages) {
                let m = message.messages[index];

                messages_container.innerHTML += `
                    <div class="message ` + m.type + `">
                        ` + m.text + `
                    </div>
                `;
            }

            if (message.feed.length > 0) {
                messages_container.innerHTML += `<div class="unread-split">Unread Messages</div>`;

                for (var index in message.feed) {
                    let m = message.feed[index];

                    messages_container.innerHTML += `
                    <div class="message ` + m.type + ` unread">
                        ` + m.text + `
                    </div>
                `;
                }
            }
        }
    });
}


function send_message(m) {
    // let message = document.querySelector()

    if (active_user != null) {
        feed_socket.emit("send message", active_user, m, function (message) {
            if (message.success) {
                console.log(message);
            }
            else {
                console.log("Error: " + message.message);
            }
        });
    }
}