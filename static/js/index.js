var socket;
var active_user;
var on_call = false, on_wait = false;

let socket_config = {
    upgrade: false,
    transports: ["websocket"]
};

var request_username_input;


function setup_user_socket() {
    socket.on("connect", function () {
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

            socket.emit("read receipt", active_user, function (res) {
                if (!res.success) {
                    alert(res.message);
                }
            })

            target.scrollTop(target.prop("scrollHeight"));
        }
        else {
            document.querySelector("#friend-block-" + message.user).classList.add("unread");
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

    setup_video_elements();
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
                        <span class="">` + friends[username][0] + `</span>
                    </div>
                `

                if (friends[username][1]) {
                    document.querySelector("#friend-block-" + username).classList.add("unread");
                }

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
            if (!message.success) {
                alert("Error: " + message.message);
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
    document.querySelector("#friend-block-" + username).classList.remove("unread");

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
                    alert(res.message);
                }
            })

            target.scrollTop(target.prop("scrollHeight"));
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
                alert("Error: " + message.message);
            }
        });
    }
}


function setup_video_elements() {
    let video = document.querySelector("#video-element");
    let canvas = document.querySelector("#canvas-element");
    let ctx = canvas.getContext('2d');

    let img = document.querySelector("#image-element");

    var localMediaStream;
    var interval;

    navigator.mediaDevices.getUserMedia({ video: true })
        .then(function (stream) {
            video.srcObject = stream;
            localMediaStream = stream;

            interval = setInterval(function () {
                if (!localMediaStream) {
                    return;
                }

                ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, 300, 150);

                let dataURL = canvas.toDataURL('image/jpeg');
                socket.emit('input image', dataURL);
            }, 50);
        }
        )
        .catch(function (error) {
            alert("Video calling blocked by browser!")
        })

    socket.on("video chat server question", function (message) {
        var response = "NO";
        if (!on_call && confirm("Do you want to start a video session with " + message.user)) {
            response = "YES";
        }
        socket.emit("video chat response", message.user, response);
    });

    socket.on("video chat server response", function (message) {
        if (message.success) {
            on_call = true;
            on_wait = false;
            document.querySelector("#wrapper").classList.add("video-mode");
            document.querySelector("#call-button").value = "End";

            socket.on("video feed", function (data) {
                if (data.message == "end") {
                    on_call = false;
                    alert("Video call ended!");

                    document.querySelector("#wrapper").classList.remove("video-mode");
                    document.querySelector("#call-button").value = "Call";
                }
                else {
                    on_call = true;
                    img.src = data.data;
                }
            });
        }
        else {
            alert("Error: " + message.message);
        }
    });
}

function toggle_video_call() {
    if (!on_wait && active_user != null) {
        if (on_call) {
            socket.emit("video chat end");
        }
        else {
            on_wait = true;
            socket.emit("video chat request", active_user);
        }
    }
}