var socket;
var active_user;

let socket_config = {
    upgrade: false,
    transports: ["websocket"]
};

var request_username_input;


function setup_user_socket() {
    socket.on("connect", function () {
        console.log("Connected to namespace users");

        socket.emit("join", function () {
            console.log("Joined room");
        });
    });
}

function setup_feed_socket() {
    let messages_container = document.querySelector("#messages-container");
    let target = $(messages_container);

    socket.on("feed request", function (message) {
        if (message.user == active_user) {
            messages_container.innerHTML += `
                <div class="message ` + message.type + ` unread">
                    <span>` + message.text + `</span>
                </div>
            `;

            target.scrollTop(target.height() + 100);
        }
    });
}


$(document).ready(function () {
    let url = location.protocol + "//" + document.domain + ":" + location.port;

    socket = io.connect(url + "/cattalks", socket_config);

    setup_user_socket();
    setup_feed_socket();

    $('#message-text').keypress(function (e) {
        var key = e.which;
        if (key == 13) {
            send_message();
            return false;
        }
    });

    load_friends();

    request_username_input = document.querySelector("#request-username-input");
});


function load_friends() {
    let first_friend = true;
    socket.emit("friends request", function (message) {
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

                if (first_friend) {
                    read_messages(document.querySelector("#friend-block-" + username));
                    first_friend = false;
                }
            }
        }
    });
}


function send_message_request() {
    let username = request_username_input.value;
    if (username != "") {
        socket.emit("send request", username, function (message) {
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

    document.querySelector("#message-wrapper").style.display = "block";

    if (active_user != null && active_user != username) {
        document.querySelector("#friend-block-" + active_user).classList.remove("active");
    }
    active_user = username;

    socket.emit("read request", username, function (message) {
        if (message.success) {
            let messages_container = document.querySelector("#messages-container");
            let target = $(messages_container);

            messages_container.innerHTML = "";

            for (var index in message.messages) {
                let m = message.messages[index];

                messages_container.innerHTML += `
                    <div class="message ` + m.type + `">
                        <span>` + m.text + `</span>
                    </div>
                `;
            }

            if (message.feed.length > 0) {
                messages_container.innerHTML += `<div class="message log"><span>Unread Messages</span></div>`;

                for (var index in message.feed) {
                    let m = message.feed[index];

                    messages_container.innerHTML += `
                        <div class="message ` + m.type + ` unread">
                            <span>` + m.text + `</span>
                        </div>
                    `;
                }
            }

            socket.emit("read receipt", username, function (res) {
                if (!res.success) {
                    console.log(res.message);
                }
            })

            target.scrollTop(target.height() + 100);
        }
    });
}


function send_message() {
    let elem = document.querySelector("#message-text");
    let m = elem.value;
    elem.value = "";


    if (active_user != null && m != "") {
        socket.emit("send message", active_user, m, function (message) {
            if (!message.success) {
                console.log("Error: " + message.message);
            }
        });
    }
}