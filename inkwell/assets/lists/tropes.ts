// Each trope's genres: the shelf filter shows a trope under these (GenreTrope).
const tropes = [
  // Romance Tropes
  {
    name: "Enemies to Lovers",
    genres: ["Romance", "Erotica", "Fantasy", "Young Adult"],
    description:
      "Two characters begin with animosity or conflict but gradually develop romantic feelings as they understand each other better.",
  },
  {
    name: "Friends to Lovers",
    genres: ["Romance", "Erotica", "Young Adult"],
    description:
      "A romantic relationship develops between characters who start as close friends.",
  },
  {
    name: "Fake Relationship",
    genres: ["Romance", "Erotica", "Young Adult"],
    description:
      "Characters pretend to be in a relationship for various reasons, only to develop real feelings.",
  },
  {
    name: "Forced Proximity",
    genres: ["Romance", "Erotica", "Young Adult"],
    description:
      "Characters are placed in close quarters or situations where they must spend time together, leading to romantic development.",
  },
  {
    name: "Second Chance Romance",
    genres: ["Romance", "Erotica"],
    description:
      "Former lovers reconnect and get another opportunity at their relationship.",
  },
  {
    name: "Marriage of Convenience",
    genres: ["Romance", "Erotica", "Historical Fiction"],
    description:
      "Characters marry for practical reasons rather than love, often developing real feelings over time.",
  },
  {
    name: "Forbidden Love",
    genres: ["Romance", "Erotica", "Historical Fiction", "Fantasy", "Young Adult"],
    description:
      "A romantic relationship that is prohibited by circumstances, social norms, or external forces.",
  },
  {
    name: "Love Triangle",
    genres: ["Romance", "Young Adult", "Fantasy"],
    description:
      "A character must choose between romantic feelings for two different people.",
  },
  {
    name: "Fated Mates",
    genres: ["Romance", "Erotica", "Fantasy", "Paranormal"],
    description:
      "Characters are destined or magically bonded to be together, commonly found in paranormal romance.",
  },
  {
    name: "Grumpy/Sunshine",
    genres: ["Romance", "Erotica"],
    description:
      "A dynamic between a brooding or cynical character and an optimistic, cheerful one who balance each other.",
  },

  // Fantasy & Adventure Tropes
  {
    name: "The Chosen One",
    genres: ["Fantasy", "Science Fiction", "Young Adult", "Adventure"],
    description:
      "A protagonist is prophesied or selected to fulfill a special destiny or save the world.",
  },
  {
    name: "The Reluctant Hero",
    genres: ["Fantasy", "Adventure", "Action", "Science Fiction", "War"],
    description:
      "A hero who is unwilling or unprepared for their role but rises to the occasion.",
  },
  {
    name: "The Quest",
    genres: ["Fantasy", "Adventure", "Children", "Young Adult"],
    description:
      "Characters embark on a journey to achieve a specific goal or retrieve a valuable object.",
  },
  {
    name: "The Mentor",
    genres: ["Fantasy", "Adventure", "Science Fiction", "Young Adult", "Literary Fiction"],
    description:
      "A wise, experienced character guides and teaches the protagonist.",
  },
  {
    name: "Magical School",
    genres: ["Fantasy", "Young Adult", "Children", "Paranormal"],
    description:
      "A setting where characters learn magic or supernatural abilities in an educational environment.",
  },
  {
    name: "Forbidden Magic",
    genres: ["Fantasy", "Paranormal", "Young Adult"],
    description:
      "Powerful magic that is restricted or dangerous, often tempting characters to use it anyway.",
  },
  {
    name: "The Lost Heir",
    genres: ["Fantasy", "Young Adult", "Historical Fiction", "Romance"],
    description:
      "A character discovers they are the hidden or exiled heir to a throne or powerful legacy.",
  },
  {
    name: "Ancient Artifacts",
    genres: ["Fantasy", "Adventure", "Thriller", "Mystery"],
    description:
      "Powerful magical objects from the past that hold significant power or significance to the plot.",
  },
  {
    name: "Found Family",
    genres: ["Fantasy", "Science Fiction", "Young Adult", "Literary Fiction", "Adventure", "Romance"],
    description:
      "Characters who are not related by blood form deep familial bonds and loyalty.",
  },
  {
    name: "Good Versus Evil",
    genres: ["Fantasy", "Children", "Young Adult", "Action", "Adventure"],
    description:
      "A central conflict between clearly defined forces of good and evil.",
  },

  // Mystery Tropes
  {
    name: "The Amateur Sleuth",
    genres: ["Mystery", "Thriller", "Young Adult", "Children"],
    description:
      "An ordinary person without professional investigation experience solves a mystery.",
  },
  {
    name: "The Grizzled Detective",
    genres: ["Mystery", "Thriller", "True Crime"],
    description:
      "A seasoned, often world-weary investigator uses experience and instinct to solve crimes.",
  },
  {
    name: "The Red Herring",
    genres: ["Mystery", "Thriller", "True Crime"],
    description:
      "A false clue or suspect that misleads readers and the protagonist away from the truth.",
  },
  {
    name: "The Unlikable Victim",
    genres: ["Mystery", "Thriller", "True Crime"],
    description:
      "The murder victim is disliked or morally questionable, complicating the investigation.",
  },
  {
    name: "The Closed Circle",
    genres: ["Mystery", "Thriller", "Horror"],
    description:
      "A mystery confined to a limited group of suspects who cannot leave the setting.",
  },
  {
    name: "The Secret from the Past",
    genres: ["Mystery", "Thriller", "Historical Fiction", "Literary Fiction", "Romance"],
    description:
      "A hidden event or truth from years ago is central to solving the current mystery.",
  },
  {
    name: "The Dramatic Reveal",
    genres: ["Mystery", "Thriller", "Horror"],
    description:
      "A climactic moment when the truth is finally exposed, often with shocking implications.",
  },

  // Psychological/Dark Tropes
  {
    name: "The Ticking Clock",
    genres: ["Thriller", "Action", "Mystery", "Science Fiction"],
    description:
      "A time limit creates urgency and tension, forcing characters to act quickly.",
  },
  {
    name: "The Unreliable Narrator",
    genres: ["Thriller", "Mystery", "Literary Fiction", "Horror"],
    description:
      "The narrator's perspective is biased, confused, or deliberately deceptive, making readers question the truth.",
  },
  {
    name: "The Conspiracy",
    genres: ["Thriller", "Mystery", "Science Fiction", "Action"],
    description:
      "A widespread plot or scheme involves multiple people and hidden agendas.",
  },
  {
    name: "The Stalker",
    genres: ["Thriller", "Horror", "True Crime"],
    description:
      "A character is obsessively pursued or watched by someone else.",
  },
  {
    name: "The Twist Ending",
    genres: ["Thriller", "Mystery", "Horror", "Short Stories"],
    description:
      "A shocking revelation that changes how readers understand the entire story.",
  },

  // Science Fiction Tropes
  {
    name: "Artificial Intelligence",
    genres: ["Science Fiction", "Thriller"],
    description:
      "Advanced AI systems play a central role, raising questions about consciousness and humanity.",
  },
  {
    name: "Dystopian Society",
    genres: ["Science Fiction", "Young Adult", "Literary Fiction"],
    description:
      "A future society characterized by oppression, control, or environmental collapse.",
  },
  {
    name: "Time Travel",
    genres: ["Science Fiction", "Fantasy", "Romance", "Historical Fiction"],
    description:
      "Characters move backward or forward through time, creating paradoxes and altering history.",
  },
  {
    name: "First Contact",
    genres: ["Science Fiction"],
    description:
      "Humanity encounters alien life for the first time, exploring the implications of meeting other civilizations.",
  },
  {
    name: "Space Travel",
    genres: ["Science Fiction", "Adventure"],
    description:
      "Characters explore space, travel between planets, or face the challenges of cosmic environments.",
  },
  {
    name: "Clones and Engineered Humans",
    genres: ["Science Fiction", "Thriller"],
    description:
      "Artificially created humans raise questions about identity, autonomy, and what it means to be human.",
  },
  {
    name: "Post-Apocalyptic Survival",
    genres: ["Science Fiction", "Horror", "Young Adult", "Action"],
    description:
      "Characters navigate a world devastated by catastrophe and must survive against harsh conditions.",
  },

  // Horror Tropes
  {
    name: "The Haunted House",
    genres: ["Horror", "Paranormal", "Mystery"],
    description:
      "A location plagued by supernatural forces or the presence of ghosts.",
  },
  {
    name: "The Cursed Object",
    genres: ["Horror", "Paranormal", "Fantasy"],
    description:
      "An item carries a curse or supernatural danger that affects anyone who possesses it.",
  },
  {
    name: "The Monster",
    genres: ["Horror", "Fantasy", "Paranormal", "Science Fiction"],
    description:
      "A terrifying creature or supernatural being is the source of horror and threat.",
  },
  {
    name: "The Isolated Setting",
    genres: ["Horror", "Thriller", "Mystery", "Science Fiction"],
    description:
      "Characters are cut off from help in a remote or confined location, intensifying fear and vulnerability.",
  },
  {
    name: "The Traumatic Past",
    genres: ["Horror", "Thriller", "Literary Fiction", "Romance"],
    description:
      "A character's previous suffering or tragic events fuel the current horror.",
  },
  {
    name: "The Final Survivor",
    genres: ["Horror", "Thriller"],
    description:
      "One character is the last standing, either to fight back or become the final victim.",
  },
  {
    name: "The Evil Next Door",
    genres: ["Horror", "Thriller", "Mystery"],
    description:
      "Horror comes from ordinary people and everyday situations rather than supernatural forces.",
  },

  // Adventure/Heist Tropes
  {
    name: "The Treasure Hunt",
    genres: ["Adventure", "Action", "Children", "Mystery"],
    description:
      "Characters search for valuable or legendary items, facing obstacles and competition.",
  },
  {
    name: "The MacGuffin",
    genres: ["Thriller", "Action", "Adventure", "Science Fiction"],
    description:
      "An object of desire drives the plot forward, though its actual importance is less significant than the pursuit of it.",
  },
  {
    name: "The Double-Cross",
    genres: ["Thriller", "Action", "Mystery", "War"],
    description:
      "A character betrays another's trust, often for personal gain or hidden motives.",
  },
  {
    name: "The Impossible Escape",
    genres: ["Action", "Thriller", "Adventure", "War"],
    description:
      "Characters must flee or escape from a seemingly inescapable situation.",
  },
  {
    name: "The Larger-Than-Life Threat",
    genres: ["Action", "Thriller", "Science Fiction", "Fantasy"],
    description:
      "An antagonist or obstacle seems overwhelming and nearly unbeatable.",
  },

  // Young Adult Tropes
  {
    name: "The Outsider",
    genres: ["Literary Fiction", "Young Adult", "Science Fiction", "Novel"],
    description:
      "A protagonist who doesn't fit in with peers, often leading to self-discovery and acceptance.",
  },
  {
    name: "First Love",
    genres: ["Young Adult", "Romance"],
    description:
      "A character experiences intense romance for the first time, often with emotional turbulence.",
  },
  {
    name: "Absent or Unreliable Adults",
    genres: ["Young Adult", "Children"],
    description:
      "Parental figures are missing, negligent, or unhelpful, forcing young characters to mature quickly.",
  },
  {
    name: "Secret Powers or Hidden Identity",
    genres: ["Young Adult", "Fantasy", "Paranormal", "Science Fiction"],
    description:
      "A character possesses abilities or a true identity that must be kept secret.",
  },
  {
    name: "The Rebellion",
    genres: ["Young Adult", "Science Fiction", "Fantasy", "War"],
    description:
      "Young characters challenge authority or societal systems to fight for change.",
  },

  // Historical Fiction Tropes
  {
    name: "Real Events, Fictional Characters",
    genres: ["Historical Fiction", "War", "Biography"],
    description:
      "Original characters are woven into actual historical events and settings.",
  },
  {
    name: "Historical Figures as Characters",
    genres: ["Historical Fiction", "Biography"],
    description:
      "Real people from history are portrayed as main or significant characters.",
  },
  {
    name: "Dual Timeline",
    genres: ["Historical Fiction", "Romance", "Literary Fiction", "Mystery"],
    description:
      "The narrative alternates between two different time periods, often revealing connections.",
  },
  {
    name: "War and Survival",
    genres: ["War", "Historical Fiction", "Biography", "Nonfiction"],
    description:
      "Characters navigate the hardships and moral complexities of wartime.",
  },
  {
    name: "Social Constraints",
    genres: ["Historical Fiction", "Romance", "Classics", "Literary Fiction"],
    description:
      "Historical social norms and restrictions create conflict and obstacles for characters.",
  },

  // Contemporary/Literary Fiction Tropes
  {
    name: "Family Drama",
    genres: ["Literary Fiction", "Novel", "Romance", "Classics"],
    description:
      "Complex family relationships and conflicts drive the central narrative.",
  },
  {
    name: "Coming of Age",
    genres: ["Literary Fiction", "Young Adult", "Novel", "Classics"],
    description:
      "A character undergoes significant personal growth and maturation during the story.",
  },
  {
    name: "Return to Hometown",
    genres: ["Romance", "Literary Fiction", "Novel"],
    description:
      "A character revisits their past by returning to where they grew up, often leading to reflection and change.",
  },
  {
    name: "A Death in the Family",
    genres: ["Literary Fiction", "Novel", "Young Adult"],
    description:
      "The loss of a family member profoundly impacts the characters and drives the plot.",
  },
  {
    name: "Reinvention",
    genres: ["Literary Fiction", "Romance", "Novel"],
    description:
      "A character transforms their identity, life, or circumstances to become someone new.",
  },
  {
    name: "The Dysfunctional Family",
    genres: ["Literary Fiction", "Novel", "Thriller"],
    description:
      "Family relationships are broken or unhealthy, serving as a central conflict.",
  },
  {
    name: "The Small Town",
    genres: ["Romance", "Mystery", "Literary Fiction", "Novel"],
    description:
      "A close-knit community where everyone knows each other's secrets and history.",
  },
  {
    name: "The Unresolved Ending",
    genres: ["Literary Fiction", "Short Stories", "Novel"],
    description:
      "The story concludes without clear resolution, leaving questions and ambiguity.",
  },
  {
    name: "Childhood Memories",
    genres: ["Literary Fiction", "Biography", "Novel", "Poetry"],
    description:
      "Vivid recollections of the past shape character perspectives and motivations.",
  },
  {
    name: "The Interior Journey",
    genres: ["Literary Fiction", "Novel", "Poetry", "Biography"],
    description:
      "Psychological and emotional growth takes precedence over external events.",
  },
];

export default tropes;
