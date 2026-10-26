// Quotes for the "Quote of the day" box. Each has the source it was found in and a link to check it (mostly Wikiquote).
// status: "sourced" = a specific original source is cited; "attributed" = widely credited and printed, but not traced to their own words.

const quotes = [
    {
        text: "I hated every minute of it. But I said to myself, 'Suffer now, and live the rest of your life as a champion'.",
        author: "Muhammad Ali",
        source: "Pete Axthelm and Peter Bonventre, \"Ali: Born Again!\", Newsweek (25 September 1978), about his training",
        url: "https://en.wikiquote.org/wiki/Muhammad_Ali",
        status: "sourced"
    },
    {
        text: "The man who views the world at 50 the same as he did at 20 has wasted 30 years of his life.",
        author: "Muhammad Ali",
        source: "Playboy interview (November 1975)",
        url: "https://en.wikiquote.org/wiki/Muhammad_Ali",
        status: "sourced"
    },
    {
        text: "It's a lack of faith that makes people afraid of meeting challenges, and I believe in myself.",
        author: "Muhammad Ali",
        source: "101 Best Ways to Get Ahead (2004), ed. Michael E. Angier and Sarah Pond, p. 59",
        url: "https://en.wikiquote.org/wiki/Muhammad_Ali",
        status: "sourced"
    },
    {
        text: "Strength does not come from winning. Your struggles develop your strengths.",
        author: "Arnold Schwarzenegger",
        source: "Interview with Marian Christy, The Boston Globe (9 May 1982)",
        url: "https://en.wikiquote.org/wiki/Arnold_Schwarzenegger",
        status: "sourced"
    },
    {
        text: "Going through the pain barrier, that's what makes the muscles grow.",
        author: "Arnold Schwarzenegger",
        source: "\"Will he be back?\", The Guardian (May 2009)",
        url: "https://en.wikiquote.org/wiki/Arnold_Schwarzenegger",
        status: "sourced"
    },
    {
        text: "That's what divides a champion from a non-champion: having the guts to go through the pain barrier.",
        author: "Arnold Schwarzenegger",
        source: "\"Will he be back?\", The Guardian (May 2009)",
        url: "https://en.wikiquote.org/wiki/Arnold_Schwarzenegger",
        status: "sourced"
    },
    {
        text: "Just remember, you can't climb the ladder of success with your hands in your pockets.",
        author: "Arnold Schwarzenegger",
        source: "University of Southern California commencement speech (May 2009)",
        url: "https://en.wikiquote.org/wiki/Arnold_Schwarzenegger",
        status: "sourced"
    },
    {
        text: "I've thrown up many times working out, but it's all worth it.",
        author: "Arnold Schwarzenegger",
        source: "Pumping Iron (1977 film)",
        url: "https://en.wikiquote.org/wiki/Pumping_Iron",
        status: "sourced"
    },
    {
        text: "Never feel sorry for yourself. Remember, if you are training hard, he may be training twice as hard.",
        author: "Matty Ferrigno",
        source: "Pumping Iron (1977 film)",
        url: "https://en.wikiquote.org/wiki/Pumping_Iron",
        status: "sourced"
    },
    {
        text: "What you put in your body is what you get out of it.",
        author: "Jack LaLanne",
        source: "Live Young Forever: 12 Steps to Health, Fitness and Longevity, p. 10",
        url: "https://en.wikiquote.org/wiki/Jack_LaLanne",
        status: "sourced"
    },
    {
        text: "To me, this one thing, physical culture and nutrition, is the salvation of America.",
        author: "Jack LaLanne",
        source: "Los Angeles Times obituary (January 2011)",
        url: "https://en.wikiquote.org/wiki/Jack_LaLanne",
        status: "sourced"
    },
    {
        text: "The Iron never lies to you.",
        author: "Henry Rollins",
        source: "\"Iron\", Details magazine (January 1993). Wikiquote cites the article but only gives excerpts",
        url: "https://en.wikiquote.org/wiki/Henry_Rollins",
        status: "sourced"
    },
    {
        text: "Friends may come and go. But two hundred pounds is always two hundred pounds.",
        author: "Henry Rollins",
        source: "\"Iron\", Details magazine (January 1993). Wikiquote cites the article but only gives excerpts",
        url: "https://en.wikiquote.org/wiki/Henry_Rollins",
        status: "sourced"
    },
    {
        text: "We run, not only because we think it is doing us good, but because it helps us to do other things better.",
        author: "Roger Bannister",
        source: "Quoted by Craig A. Masback, \"A Sports White Paper for Clinton\", The New York Times (24 January 1993), p. S-11 (the wording leaves out a few words of the original)",
        url: "https://en.wikiquote.org/wiki/Roger_Bannister",
        status: "sourced"
    },
    {
        text: "Limits, like fears, are often just an illusion.",
        author: "Michael Jordan",
        source: "Naismith Basketball Hall of Fame induction speech (2009)",
        url: "https://en.wikiquote.org/wiki/Michael_Jordan",
        status: "sourced"
    },
    {
        text: "I've missed over 9,000 shots in my career.",
        author: "Michael Jordan",
        source: "Nike advertisement, quoted in Goldman and Papson, Nike Culture (1998), p. 49",
        url: "https://en.wikiquote.org/wiki/Michael_Jordan",
        status: "sourced"
    },
    {
        text: "I've failed over and over and over again in my life.",
        author: "Michael Jordan",
        source: "Nike advertisement, quoted in Goldman and Papson, Nike Culture (1998), p. 49",
        url: "https://en.wikiquote.org/wiki/Michael_Jordan",
        status: "sourced"
    },
    {
        text: "Only the disciplined ones are free in life.",
        author: "Eliud Kipchoge",
        source: "Oxford Union talk (2018)",
        url: "https://en.wikiquote.org/wiki/Eliud_Kipchoge",
        status: "sourced"
    },
    {
        text: "Resilience is one of the recipes for success. If you are not resilient then you cannot go anywhere.",
        author: "Eliud Kipchoge",
        source: "ClickOrlando interview (2023)",
        url: "https://en.wikiquote.org/wiki/Eliud_Kipchoge",
        status: "sourced"
    },
    {
        text: "In breaking the two-hour barrier, I want to open minds to think that no human is limited.",
        author: "Eliud Kipchoge",
        source: "CNN (2019)",
        url: "https://en.wikiquote.org/wiki/Eliud_Kipchoge",
        status: "sourced"
    },
    {
        text: "It ain't about how hard you hit. It's about how hard you can get hit and keep moving forward.",
        author: "Rocky Balboa",
        source: "Rocky Balboa (2006 film), a line spoken by the character",
        url: "https://en.wikiquote.org/wiki/Rocky_Balboa_(film)",
        status: "sourced"
    },
    {
        text: "Gentlemen, we are going to relentlessly chase perfection, knowing full well we will not catch it, because nothing is perfect.",
        author: "Vince Lombardi",
        source: "First team meeting as Packers coach (1959), reported in Chuck Carlson, Game of My Life (2004), p. 149",
        url: "https://en.wikiquote.org/wiki/Vince_Lombardi",
        status: "attributed"
    },
    {
        text: "The battles that count aren't the ones for gold medals.",
        author: "Jesse Owens",
        source: "Blackthink: My Life as Black Man and White Man (1970)",
        url: "https://en.wikiquote.org/wiki/Jesse_Owens",
        status: "sourced"
    },
    {
        text: "Dream as big as you can dream, and anything is possible.",
        author: "Michael Phelps",
        source: "After his seventh gold medal at the Beijing Olympics, 16 August 2008, reported by Sports Illustrated",
        url: "https://en.wikiquote.org/wiki/Michael_Phelps",
        status: "sourced"
    },
    {
        text: "Anybody can do anything that they set their mind to.",
        author: "Michael Phelps",
        source: "After his eighth gold medal at the Beijing Olympics, 17 August 2008, reported by CNN",
        url: "https://en.wikiquote.org/wiki/Michael_Phelps",
        status: "sourced"
    },
    {
        text: "If you want to win something, run the 100 meters. If you want to experience something, run a marathon.",
        author: "Emil Zátopek",
        source: "\"Making a run at the Olympic dream\", The StarPhoenix (9 May 2007)",
        url: "https://en.wikiquote.org/wiki/Emil_Z%C3%A1topek",
        status: "attributed"
    },
    {
        text: "I was not talented enough to run and smile at the same time.",
        author: "Emil Zátopek",
        source: "Mike Rowbottom, \"Olympic legend Zatopek dies aged 78\", The Independent (23 November 2000)",
        url: "https://en.wikiquote.org/wiki/Emil_Z%C3%A1topek",
        status: "attributed"
    },
    {
        text: "It's at the borders of pain and suffering that the men are separated from the boys.",
        author: "Emil Zátopek",
        source: "\"Citius, Altius, Fortius\", Khaleej Times (8 August 2008)",
        url: "https://en.wikiquote.org/wiki/Emil_Z%C3%A1topek",
        status: "attributed"
    },
    {
        text: "There are no limits. There are plateaus, but you must not stay there, you must go beyond them.",
        author: "Bruce Lee",
        source: "The Art of Expressing the Human Body (1998), ed. John R. Little, p. 23",
        url: "https://en.wikiquote.org/wiki/Bruce_Lee",
        status: "sourced"
    },
    {
        text: "Make at least one definite move daily toward your goal.",
        author: "Bruce Lee",
        source: "Jeet Kune Do (1997), ed. John Little, Part 6",
        url: "https://en.wikiquote.org/wiki/Bruce_Lee",
        status: "sourced"
    },
    {
        text: "Research your own experience; absorb what is useful, reject what is useless and add what is essentially your own.",
        author: "Bruce Lee",
        source: "Striking Thoughts (2000), p. 176",
        url: "https://en.wikiquote.org/wiki/Bruce_Lee",
        status: "sourced"
    },
    {
        text: "If you think a thing is impossible, you'll make it impossible.",
        author: "Bruce Lee",
        source: "Striking Thoughts (2000), p. 121",
        url: "https://en.wikiquote.org/wiki/Bruce_Lee",
        status: "sourced"
    },
    {
        text: "It is a disgrace to grow old through sheer carelessness before seeing what manner of man you may become by developing your bodily strength and beauty to their highest limit.",
        author: "Socrates",
        source: "Xenophon, Memorabilia, Book III (Wikiquote cites III.7.8; other editions number the passage III.12). Translation as quoted by Wikiquote",
        url: "https://en.wikiquote.org/wiki/Socrates",
        status: "sourced"
    },
    {
        text: "There are no shortcuts to success on the field or in life.",
        author: "Tom Brady",
        source: "Instagram retirement post (1 February 2022)",
        url: "https://en.wikiquote.org/wiki/Tom_Brady",
        status: "sourced"
    },
    {
        text: "Whenever my team loses a game, it's an opportunity to learn something.",
        author: "Tom Brady",
        source: "The TB12 Method (2017), pp. 271-272",
        url: "https://en.wikiquote.org/wiki/Tom_Brady",
        status: "sourced"
    },
    {
        text: "I played because I was dedicated to being the best.",
        author: "Bill Russell",
        source: "\"I'm Not Involved Anymore\", Sports Illustrated (1969)",
        url: "https://en.wikiquote.org/wiki/Bill_Russell",
        status: "sourced"
    },
    {
        text: "Active exercise, therefore, and temperance can preserve some part of one's former strength even in old age.",
        author: "Cicero",
        source: "De Senectute (On Old Age), about 35-36. This translation is the one quoted by the BMJ blog and Substack pieces linked; other translations word it differently",
        url: "https://blogs.bmj.com/bmj/2020/02/17/richard-smith-whom-to-trust-on-old-age-matt-hancock-or-cicero",
        status: "sourced"
    },
    {
        text: "Sport has the power to change the world. It has the power to inspire.",
        author: "Nelson Mandela",
        source: "Speech at the first Laureus World Sports Awards, Monaco (25 May 2000)",
        url: "https://www.laureus.com/world-sports-awards/2000",
        status: "sourced"
    },
    {
        text: "I wish to preach, not the doctrine of ignoble ease, but the doctrine of the strenuous life.",
        author: "Theodore Roosevelt",
        source: "\"The Strenuous Life\", speech to the Hamilton Club, Chicago (10 April 1899)",
        url: "https://www.trlibrary.com/tr/speeches/strenuous-life",
        status: "sourced"
    },
    {
        text: "The first wealth is health.",
        author: "Ralph Waldo Emerson",
        source: "\"Power\", The Conduct of Life (1860). Full text on Project Gutenberg",
        url: "https://www.gutenberg.org/ebooks/39827",
        status: "sourced"
    }
];

// Picks one quote per calendar day (days since 1 January 1970, server's local date), so it changes at midnight and cycles through the whole list before repeating.
function quoteOfTheDay(date = new Date()) {
    const dayNumber = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
    return quotes[dayNumber % quotes.length];
}

module.exports = { quotes, quoteOfTheDay };
