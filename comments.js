
function uuidv4() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}


async function comments_init(thread)
{
    const relay = await Relay("wss://relay.damus.io")
    const now = (new Date().getTime()) / 1000
    const model = {events: [], profiles: {}}
    const comments_id = uuidv4()
    const profiles_id = uuidv4()

    model.pool = relay
    model.el = document.querySelector("#comments")

    relay.subscribe(comments_id, {kinds: [1], "#e": [thread]})

    relay.event = (sub_id, ev) => {
        if (sub_id === comments_id) {
            if (ev.content !== "")
                insert_event_sorted(model.events, ev)
            if (model.realtime)
                render_home_view(model)
        } else if (sub_id === profiles_id) {
            try {
                model.profiles[ev.pubkey] = JSON.parse(ev.content)
            } catch {
                console.log("failed to parse", ev.content)
            }
        }
    }

    relay.eose = async (sub_id) => {
        if (sub_id === comments_id) {
            handle_comments_loaded(profiles_id, model)
        } else if (sub_id === profiles_id) {
            handle_profiles_loaded(profiles_id, model)
        }
    }

    return relay
}

function handle_profiles_loaded(profiles_id, model) {
    // stop asking for profiles
    model.pool.unsubscribe(profiles_id)
    model.realtime = true
    render_home_view(model)
}

// load profiles after comment notes are loaded
function handle_comments_loaded(profiles_id, model)
{
    const pubkeys = model.events.reduce((s, ev) => {
        s.add(ev.pubkey)
        return s
    }, new Set())
    const authors = Array.from(pubkeys)

    // load profiles
    model.pool.subscribe(profiles_id, {kinds: [0], authors: authors})
}

function render_home_view(model) {
    model.el.innerHTML = render_events(model)
}

function render_events(model) {
    const render = render_event.bind(null, model)
    return model.events.map(render).join("\n")
}

function render_event(model, ev) {
    const profile = model.profiles[ev.pubkey] || {
        name: "anon",
        display_name: "Anonymous",
    }
    let parsed = verifyBitcoinAddress(ev)
    if(parsed) {
        fundingEvent(parsed, profile, ev)
    } else {
        const delta = time_delta(new Date().getTime(), ev.created_at*1000)
        return `
	<div class="comment">
		<div class="info">
		    <div class="username">${sanitize(get_name(ev.pubkey, profile))}</div>
			<span>${delta}</span>
		</div>
		<img class="pfp" src="${get_picture(ev.pubkey, profile)}">
		<p>
		${format_content(ev.content)}
		</p>
	</div>
	`
    }
}

var funders = -1
var addresses = new Map;
var totalFunding = 0



function fundingEvent(parsed, profile, ev) {
    try {
        if(verifyBitcoinSignedEvent(window.NostrTools.nip19.npubEncode(ev.pubkey), parsed[0], parsed[1])) {
            if (!addresses.get(parsed[0])) {
                addresses.set(parsed[0], true)
                let t = document.getElementById("funders")
                let tr = document.createElement("tr")
                tr.id = "table_row_"+ev.id
                tr.appendChild(makeTd(funders+1))
                let name = sanitize(get_name(ev.pubkey, profile))
                let link = document.createElement("a")
                link.href = "https://snort.social/e/" + window.NostrTools.nip19.noteEncode(ev.id)
                link.innerText = name
                let name_proof = makeTd()
                name_proof.appendChild(link)
                tr.appendChild(name_proof)
                let amountRow = makeTd("Fetching amount....")
                getBalance(parsed[0]).then(result => {
                    if(result) {
                        amountRow.innerText = result.toLocaleString()+ " sats";
                        totalFunding += result
                        if (document.getElementById("total_funding_row")) {
                            document.getElementById("total_funding_row").remove()
                        }
                        let tr_total = document.createElement("tr")
                        tr_total.id = "total_funding_row"
                        tr_total.append(makeTd(), makeTd("TOTAL:"), makeTd(totalFunding.toLocaleString()+ " sats"))
                        t.appendChild(tr_total)
                    }
                    if (!result) {
                        if (result === 0) {
                            document.getElementById("table_row_"+ev.id).remove()
                            funders--
                        }
                    }
                })
                tr.appendChild(amountRow)
                if (funders < 0) {
                    t.replaceChildren(tr)

                } else {
                    t.appendChild(tr)
                }
                funders++
            }
        }
    } catch (e) {}
}

function makeTd(inner) {
    theadh = document.createElement("td")
    try {theadh.appendChild(inner)} catch (e) {
        if (typeof inner != "undefined") {
            theadh.innerText = inner
        }
    }
    return theadh
}

function convert_quote_blocks(content)
{
    const split = content.split("\n")
    let blockin = false
    return split.reduce((str, line) => {
        if (line !== "" && line[0] === '>') {
            if (!blockin) {
                str += "<span class='quote'>"
                blockin = true
            }
            str += sanitize(line.slice(1))
        } else {
            if (blockin) {
                blockin = false
                str += "</span>"
            }
            str += sanitize(line)
        }
        return str + "<br/>"
    }, "")
}

function format_content(content)
{
    return convert_quote_blocks(content)
}

function sanitize(content)
{
    if (!content)
        return ""
    return content.replaceAll("<","&lt;").replaceAll(">","&gt;")
}

function get_picture(pk, profile)
{
    return sanitize(profile.picture) || "https://robohash.org/" + pk
}

function get_name(pk, profile={})
{
    const display_name = profile.display_name || profile.user
    const username = profile.name || "anon"
    return  display_name || username
}

function time_delta(current, previous) {
    var msPerMinute = 60 * 1000;
    var msPerHour = msPerMinute * 60;
    var msPerDay = msPerHour * 24;
    var msPerMonth = msPerDay * 30;
    var msPerYear = msPerDay * 365;

    var elapsed = current - previous;

    if (elapsed < msPerMinute) {
        return Math.round(elapsed/1000) + ' seconds ago';
    }

    else if (elapsed < msPerHour) {
        return Math.round(elapsed/msPerMinute) + ' minutes ago';
    }

    else if (elapsed < msPerDay ) {
        return Math.round(elapsed/msPerHour ) + ' hours ago';
    }

    else if (elapsed < msPerMonth) {
        return Math.round(elapsed/msPerDay) + ' days ago';
    }

    else if (elapsed < msPerYear) {
        return Math.round(elapsed/msPerMonth) + ' months ago';
    }

    else {
        return Math.round(elapsed/msPerYear ) + ' years ago';
    }
}
