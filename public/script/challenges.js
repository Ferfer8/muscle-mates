// Daily challenges. challengeOfTheDay() picks one per calendar day, the same for everyone, and it changes at midnight.

// title: heading and notification name. task: what to do. show: what to post as proof, e.g. "a photo of your plate".
const challenges = [
    // ----- Strength -----
    { title: "10 push-ups", task: "Do 10 push-ups with good form. Drop to your knees if you need to.", show: "a photo of you doing them" },
    { title: "20 squats", task: "Do 20 bodyweight squats, going as low as feels comfortable.", show: "a photo of you doing them" },
    { title: "30-second plank", task: "Hold a plank for 30 seconds without letting your hips sag.", show: "a photo of your plank" },
    { title: "Lunge it out", task: "Do 10 lunges on each leg.", show: "a photo of your lunges" },
    { title: "10 burpees", task: "Do 10 burpees. Take your time, there's no rush.", show: "a photo of you doing them" },
    { title: "20 sit-ups", task: "Do 20 sit-ups, or crunches if that's kinder on your back.", show: "a photo of you doing them" },
    { title: "Wall sit", task: "Hold a wall sit for 45 seconds, thighs parallel to the floor.", show: "a photo of your wall sit" },
    { title: "Chair dips", task: "Do 12 triceps dips using a sturdy chair or bench.", show: "a photo of you doing them" },
    { title: "25 glute bridges", task: "Lie on your back and do 25 glute bridges, squeezing at the top.", show: "a photo of you doing them" },
    { title: "Pull-up or hang", task: "Do as many pull-ups as you can, or just hang from a bar for 15 seconds.", show: "a photo of your attempt" },
    { title: "20 mountain climbers", task: "Do 20 mountain climbers (counting each leg) at a steady pace.", show: "a photo of you doing them" },
    { title: "Superman hold", task: "Lie face down and hold a superman pose for 30 seconds.", show: "a photo of your hold" },
    { title: "Farmer's carry", task: "Carry two heavy bags or weights for 30 metres without putting them down.", show: "a photo of your carry" },
    { title: "Slow-motion squats", task: "Do 10 squats, taking 3 seconds down and 3 seconds up.", show: "a photo of you doing them" },
    { title: "Single-leg balance", task: "Stand on one leg for 30 seconds, then switch legs.", show: "a photo of your balance" },

    // ----- Cardio -----
    { title: "Go for a walk", task: "Get outside and take a walk, even a short one.", show: "a photo from your walk" },
    { title: "20-minute walk", task: "Walk for 20 minutes, with music or a podcast if you like.", show: "a photo of where you walked" },
    { title: "Jog 1 kilometre", task: "Jog (or run-walk) one kilometre.", show: "a photo of your tracker or the route" },
    { title: "100 skips", task: "Do 100 skips with a jump rope, or pretend rope if you don't have one.", show: "a photo of your skipping" },
    { title: "Dance it out", task: "Dance to one full song, as energetically as you can.", show: "a photo of your dancing" },
    { title: "Take the stairs", task: "Choose the stairs over the lift or escalator all day.", show: "a photo of the stairs you climbed" },
    { title: "Shadow boxing", task: "Shadow box for 3 rounds of 1 minute, with 30 seconds' rest between.", show: "a photo of you mid-round" },
    { title: "10-minute HIIT", task: "Do a 10-minute high-intensity interval workout: 30 seconds hard, 30 seconds rest.", show: "a photo of your workout" },
    { title: "Sprint intervals", task: "Do 5 sprints of 20 seconds, walking back to recover each time.", show: "a photo of where you sprinted" },
    { title: "Jumping jacks", task: "Do 50 jumping jacks, in sets if you need to.", show: "a photo of you doing them" },

    // ----- Hydration and food -----
    { title: "Drink 2 litres of water", task: "Drink at least 2 litres of water today.", show: "a photo of your bottle or tracker" },
    { title: "Eat the rainbow", task: "Put at least 4 different colours of fruit and veg on one plate.", show: "a photo of your colourful plate" },
    { title: "Protein-packed meal", task: "Cook a meal with a good source of protein in it.", show: "a photo of your meal" },
    { title: "Water instead of fizzy", task: "Swap every sugary drink today for water, or something unsweetened.", show: "a photo of your drink of choice" },
    { title: "Veg at every meal", task: "Include a portion of vegetables in every meal today.", show: "a photo of your veggiest meal" },
    { title: "Meal prep", task: "Prepare tomorrow's lunch tonight.", show: "a photo of your prepped lunch" },
    { title: "Healthy breakfast", task: "Start the day with a breakfast that has protein and fibre.", show: "a photo of your breakfast" },
    { title: "Try a new healthy recipe", task: "Cook something nutritious you've never made before.", show: "a photo of the finished dish" },
    { title: "Fruit snack", task: "Swap your usual snack for a piece of fruit.", show: "a photo of your fruit" },
    { title: "Hydration check", task: "Fill a water bottle first thing and finish it before lunch.", show: "a photo of your empty bottle" },

    // ----- Mobility and recovery -----
    { title: "5-minute stretch", task: "Stretch your whole body for 5 minutes.", show: "a photo of your stretch" },
    { title: "Touch your toes", task: "Stand, reach for your toes and hold for 30 seconds. Reach as far as is comfortable.", show: "a photo of your stretch" },
    { title: "Sun salutations", task: "Flow through 5 yoga sun salutations.", show: "a photo of you mid-flow" },
    { title: "Foam roll", task: "Spend 5 minutes foam rolling your legs and back. A rolled towel works too.", show: "a photo of your setup" },
    { title: "10 minutes of calm", task: "Sit quietly and breathe slowly for 10 minutes.", show: "a photo of the spot you chose" },
    { title: "Early night", task: "Aim to be in bed 30 minutes earlier than usual.", show: "a photo of your cosy bedtime setup" },
    { title: "Shoulder rolls", task: "Do 20 slow shoulder rolls and 20 neck tilts, especially if you sit a lot.", show: "a photo of you doing them" },
    { title: "Hip opener", task: "Hold a deep lunge or pigeon pose for 30 seconds on each side.", show: "a photo of your stretch" },
    { title: "Desk break", task: "Stand up and move for 5 minutes every hour for a few hours today.", show: "a photo of your standing set-up" },
    { title: "Walk barefoot", task: "Spend 10 minutes barefoot on grass, sand or at home, to wake up your feet.", show: "a photo of your feet in the grass or sand" },

    // ----- Mindset and mates -----
    { title: "Train with a gym mate", task: "Work out with a friend, in person or on a video call.", show: "a photo of you and your gym mate" },
    { title: "Write 3 goals", task: "Write down 3 fitness goals: one for this week, one for this month, one for this year.", show: "a photo of your notes" },
    { title: "Try something new", task: "Do an exercise or class you've never tried.", show: "a photo of you trying it" },
    { title: "Workout playlist", task: "Make or share the playlist that gets you moving.", show: "a screenshot or photo of your playlist" },
    { title: "Outdoor workout", task: "Take your workout outside: a park, a beach, a car park, anywhere with fresh air.", show: "a photo of your outdoor spot" },
    { title: "Teach a move", task: "Show someone how to do one of your favourite exercises properly.", show: "a photo of you teaching it" },
    { title: "Favourite place to train", task: "Show us where you love to work out, whether that's a gym, living room or trail.", show: "a photo of your favourite training spot" },
    { title: "10,000 steps", task: "Aim for 10,000 steps today. Every bit counts.", show: "a screenshot of your step count" },
    { title: "Cheer a mate on", task: "Send a message of encouragement to someone on their fitness journey.", show: "a photo of you with something that motivates you" },
    { title: "Gym bag ready", task: "Pack your gym bag tonight, so tomorrow's workout has no excuses.", show: "a photo of your packed bag" }
];

// The day's challenge is (dayNumber * step) % list length. A step with no common factor with the length (gcd 1) visits every challenge once before any repeat,
// but jumps around the list so it doesn't feel predictable. The step is worked out from the list length, so adding or removing challenges is fine.
// gcd finds the greatest common factor of two numbers.
function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}

// The smallest step from 7 upwards that has no common factor with the list length
function findStep(length) {
    let step = 7;
    while (gcd(step, length) !== 1) step++;
    return step;
}

const STEP = findStep(challenges.length);

// The challenge for a date (today, unless another date is given), plus the date as text such as "2026-10-17"
function challengeOfTheDay(date = new Date()) {
    const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
    const challenge = challenges[(dayNumber * STEP) % challenges.length];
    const pad = (value) => String(value).padStart(2, '0');
    return { ...challenge, date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` };
}

// server.js loads this file with require(), while browsers load it as a plain script where module doesn't exist, hence the check.
if (typeof module !== 'undefined') module.exports = { challenges, challengeOfTheDay };
