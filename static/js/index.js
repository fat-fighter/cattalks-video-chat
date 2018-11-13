var socket;
var active_user;
var live_video_interval;
var on_call = false, on_wait = false;

var video_element, image_element;
var canvas_element, canvas_context;

var media_stream;

let socket_config = {
    upgrade: false,
    transports: ["websocket"]
};

var request_username_input;


$(document).ready(function () {
    let url = location.protocol + "//" + document.domain + ":" + location.port;

    socket = io.connect(url + "/cattalks", socket_config);

    setup_user_socket();
    setup_feed_socket();
    setup_message_request_socket();

    $('#message-text').keypress(function (e) {
        var key = e.which;
        if (key == 13) {
            send_message();
            return false;
        }
    });

    load_friends();

    request_username_input = document.querySelector("#request-username-input");

    setup_video_sockets();
});

// Defining Socket Event Handlers

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


function setup_message_request_socket() {
    let requests_blocks_container = document.querySelector("#request-blocks-container")
    let friends_blocks_container = document.querySelector("#friend-blocks-container");

    socket.on("message request", function (message) {
        if (message.type == "request") {
            requests_blocks_container.innerHTML += `
                <div class="request-block" id ="request-block-` + message.user + `">
                    <span class="">` + message.name + `</span>
                    <input type="button" value="&#10004;" onclick="accept_request('` + message.user + `')">
                    <input type="button" value="&#10005;" onclick="reject_request('` + message.user + `')">
                </div>
            `
        }
        else {
            if (message.success) {
                friends_blocks_container.innerHTML += `
                    <div class="friend-block unread" id ="friend-block-` + message.user + `" onclick="read_messages(this)">
                        <img src="/static/img/cat-profile.png">
                        <span>` + message.name + `</span>
                    </div>
                `
            }
            else {
                alert(message.name + " has denied your request to chat");
            }
        }
    });
}


function setup_video_sockets() {
    video_element = document.querySelector("#video-element");
    image_element = document.querySelector("#image-element");

    canvas_element = document.querySelector("#canvas-element");
    canvas_context = canvas_element.getContext('2d');

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

            start_video_call();

            socket.on("video feed", function (data) {
                if (data.message == "end") {
                    stop_video_call();

                    alert("Video call ended!");

                    on_call = false;
                }
                else {
                    on_call = true;
                    image_element.src = data.data;
                }
            });
        }
        else {
            alert("Error: " + message.message);
        }
    });
}


// Defining Document OnLoad Functions

function load_friends() {
    let first_friend = true;
    let friends_blocks_container = document.querySelector("#friend-blocks-container");
    let requests_blocks_container = document.querySelector("#request-blocks-container");

    friends_blocks_container.innerHTML = "";
    requests_blocks_container.innerHTML = "<h3>Pending Requests</h3>";

    socket.emit("friends request", function (message) {
        if (message.success) {
            let friends = message.friends;
            let requests = message.requests;

            for (var username in friends) {
                unread = (friends[username][1]) ? "unread" : "";
                friends_blocks_container.innerHTML += `
                    <div class="friend-block ` + unread + `" id ="friend-block-` + username + `" onclick="read_messages(this)">
                        <img src="/static/img/cat-profile.png">
                        <span>` + friends[username][0] + `</span>
                    </div>
                `

                if (first_friend) {
                    read_messages(document.querySelector("#friend-block-" + username));
                    first_friend = false;
                }
            }

            for (var username in requests) {
                requests_blocks_container.innerHTML += `
                    <div class="request-block" id ="request-block-` + username + `">
                        <span class="">` + requests[username] + `</span>
                        <input type="button" value="&#10004;" onclick="accept_request('` + username + `')">
                        <input type="button" value="&#10005;" onclick="reject_request('` + username + `')">
                    </div>
                `
            }
        }
    });
}


// Defining User Control Sequences

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


function accept_request(username) {
    socket.emit("accept request", username, function (message) {
        if (message.success) {
            document.querySelector("#request-block-" + username).remove()
        }
        else {
            alert("Error: " + message.message);
        }
    });
}


function reject_request(username) {
    socket.emit("reject request", username, function (message) {
        if (message.success) {
            document.querySelector("#request-block-" + username).remove();
        }
        else {
            alert("Error: " + message.message);
        }
    });
}


function toggle_video_call() {
    if (!on_wait && active_user != null) {
        if (on_call) {
            socket.emit("video chat end", function (message) {
                if (message.success) {
                    clearInterval(live_video_interval);
                }
                else {
                    alert("Error: " + message.message);
                }
            });
        }
        else {
            on_wait = true;
            socket.emit("video chat request", active_user);
        }
    }
}


function start_video_call() {
    document.querySelector("#wrapper").classList.add("video-mode");
    document.querySelector("#call-button").value = "End";

    navigator.mediaDevices.getUserMedia({ video: true })
        .then(function (stream) {
            video_element.srcObject = stream;
            media_stream = stream;

            live_video_interval = setInterval(function () {
                if (!media_stream) {
                    return;
                }

                canvas_context.drawImage(video_element, 0, 0, video_element.videoWidth, video_element.videoHeight, 0, 0, 300, 150);

                let dataURL = canvas_element.toDataURL('image/jpeg');
                socket.emit('input image', dataURL);
            }, 50);
        }
        )
        .catch(function (error) {
            alert("Video calling blocked by browser!")
        })
}

function stop_video_call() {
    document.querySelector("#wrapper").classList.remove("video-mode");
    document.querySelector("#call-button").value = "Call";

    media_stream.getTracks()[0].stop();
}