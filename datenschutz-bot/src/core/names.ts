// Wortlisten für die Namenserkennung. Bewusst nur Daten, keine Logik.

const words = (raw: string): string[] => raw.split(/\s+/).filter(Boolean);

// Häufige Vornamen aus den Herkunftsländern typischer Gäste und Geschäftspartner.
// Bewusst weggelassen: Namen, die auch normale Wörter oder Orte sind
// (Mark, Will, May, Rose, Iris, Kai, Ernst, Per, Can, Dick, Bart, Floor, Marina, Milan, Ion, Franco, Hunter …).
const FIRST_NAMES_RAW = `
Anna Maria Lena Lea Leonie Laura Sarah Sara Julia Katharina Katarina Sophie Sophia Sofia Hannah Hanna Emma Mia Emilia
Lina Marie Johanna Elisabeth Theresa Teresa Magdalena Christina Christine Christiane Christa Christel Sabine Andrea
Petra Claudia Monika Barbara Susanne Susanna Stefanie Stephanie Nicole Melanie Martina Birgit Brigitte Brigitta
Gabriele Karin Renate Ingrid Ursula Helga Gertrud Gertraud Elfriede Hildegard Erika Margarete Margit Margot Rosa
Franziska Veronika Verena Viktoria Victoria Valentina Nina Lisa Eva Elena Carina Corinna Jasmin Jessica Jennifer
Vanessa Selina Sandra Daniela Manuela Michaela Silvia Sylvia Simone Tanja Bettina Doris Elke Heidi Jana Katrin Kathrin
Kerstin Sonja Ulrike Anja Alexandra Anita Angelika Astrid Bianca Cornelia Kornelia Diana Elisa Emily Fabienne Helena
Isabella Isabel Ida Ines Irene Jacqueline Josefine Klara Clara Larissa Lara Leni Luisa Louisa Magda Marlene Mathilda
Mathilde Miriam Natalie Nathalie Nadine Olivia Paula Paulina Pia Rebecca Regina Romana Ronja Ruth Sabrina Sabina
Stella Svenja Tamara Theresia Vera Waltraud Yvonne Zoe Antonia Agnes Annemarie Charlotte Ella Frieda Greta Hedwig
Josefa Juliane Lotte Luise Martha Rosemarie Thea Hilde Irmgard Gisela Angela Anke Annette Antje Beate Bärbel Berta
Carla Carola Dagmar Dora Dorothea Edith Elfi Ellen Elli Emilie Erna Evelyn Friederike Gabi Gerda Gerlinde Gudrun
Hannelore Heike Helene Herta Hertha Ilona Ilse Inge Ingeborg Judith Jutta Karina Karoline Liane Lieselotte Lilli Lilly
Lucia Luzia Marianne Marion Marlies Meike Mila Mira Nadja Nele Ottilie Patricia Ramona Rita Rosalie Silke Sieglinde
Sigrid Sofie Tatjana Ute Valerie Walburga Wiebke Zita Steffi Resi Vroni Gerti Lisi Kathi Susi Moni Uschi Rosi Conny
Thomas Michael Andreas Stefan Stephan Christian Markus Marcus Martin Peter Alexander Daniel Florian Tobias Matthias
Mathias Johannes Josef Joseph Johann Franz Karl Carl Georg Wolfgang Herbert Helmut Helmuth Gerhard Günter Günther
Manfred Werner Walter Jürgen Klaus Dieter Bernhard Bernd Robert Richard Rudolf Roland Reinhard Harald Heinz Hans
Hermann Horst Gerald Gernot Hubert Hubertus Anton Alois Leopold Ludwig Lukas Lucas Jakob Jonas Leon Paul Felix
Maximilian Max Elias Noah Ben Luca Luka Moritz Simon David Fabian Julian Sebastian Philipp Philip Patrick Dominik
Kevin Marcel Mario Marco Manuel Niklas Nikolaus Oliver Oskar Oscar Pascal Raphael Rafael Valentin Vincent Benjamin
Benedikt Bastian Christoph Clemens Klemens Dennis Erich Erwin Ewald Ferdinand Fritz Friedrich Gabriel Gregor Hannes
Heinrich Jan Jens Jörg Kurt Lorenz Matteo Nico Norbert Otto Reinhold Siegfried Sven Theo Theodor Ulrich Uwe Viktor
Wilhelm Willi Armin Arnold Benno Emil Erik Eric Konrad Konstantin Lennart Leonhard Marius Mathis Rainer Reiner René
Rene Roman Samuel Severin Adrian Albert Alfred Andre André Arthur Axel Bertram Burkhard Carsten Detlef Dietmar
Dietrich Egon Engelbert Eugen Gottfried Hartmut Heiko Henning Henrik Holger Ignaz Ingo Joachim Jochen Lambert
Laurenz Linus Lothar Malte Olaf Pius Quirin Ralf Ralph Robin Rolf Rüdiger Rupert Tilo Torsten Udo Vinzenz Volker
Wendelin Wilfried Wolfram Xaver Yannick Toni Sepp Seppi Hansi Andi Flo Basti Michi Wolfi Rudi Benni Sascha
Giuseppe Giovanni Francesco Antonio Alessandro Lorenzo Leonardo Riccardo Davide Federico Stefano Paolo Roberto
Giulia Francesca Chiara Federica Alessia Giorgia Aurora Ginevra Beatrice Alice Camilla Serena Roberta Alberto Angelo
Antonella Arianna Bruno Carlo Caterina Cesare Claudio Cristina Dario Domenico Emanuele Enrico Enzo Fabio Fabrizio
Filippo Gabriele Gaia Giacomo Gianluca Gianni Giorgio Giuliana Giulio Giuseppina Ilaria Luigi Marcello Marta Massimo
Matilde Maurizio Michela Michele Nicola Nicolò Noemi Paola Pietro Raffaele Renato Rocco Salvatore Sergio Simona
Tommaso Valeria Valerio Vincenzo Vittoria Vittorio
Alejandro Carlos Carmen Diego Eduardo Fernando Francisco Gabriela Javier Jorge José Josefa Juan Juana Lucía Luis
María Miguel Pablo Pedro Ramón Raúl Santiago Sofía João Gonçalo Inês Joana Rui Tiago
Amélie Antoine Aurélie Benoît Camille Céline Chloé Claire Clément Delphine Élodie Émilie Étienne Fabrice François
Françoise Frédéric Guillaume Hélène Isabelle Jacques Jean Jérôme Julien Laurent Léa Louis Manon Marc Margaux Mathieu
Nicolas Olivier Pauline Philippe Pierre Sébastien Stéphane Sylvie Thierry Valérie Yves
James John William Charles Christopher Matthew Anthony Andrew Joshua Brian George Edward Ryan Jacob Nicholas Jonathan
Stephen Steven Harry Jack Liam Ethan Mary Patricia Linda Elizabeth Susan Karen Nancy Margaret Ashley Michelle Amanda
Melissa Amy Amelia Chloe Lucy Kate Katherine Catherine Rachel Helen Aaron Abigail Adam Aidan Alan Alison Andy Anne
Annie Barry Bethany Bradley Brendan Bridget Caitlin Callum Carl Caroline Carol Cathal Charlie Ciara Ciaran Colin Conor
Craig Darren Declan Deirdre Derek Donal Donna Dylan Eamon Eileen Eleanor Ellie Eoin Erin Evan Fiona Gareth Gavin Gemma
Gerard Gillian Graham Grace Heather Henry Holly Ian Jake Jamie Jane Janet Jason Jeffrey Jeremy Joan Joanne Joe Jordan
Julie Justin Kathleen Katie Keith Kelly Kieran Lauren Leah Leo Lewis Louise Luke Mairead Megan Molly Naomi Neil
Niall Niamh Owen Roisin Ronan Samantha Scott Sean Seamus Shane Sharon Sinead Siobhan Stuart Timothy Tom Tony Trevor
Wayne Brittany Chelsea Cody Kayla Madison Tyler Brandon Mike Chris Alex Sam Nick Bob Ted Danny Jenny Steve Dave Rob
Tommy Johnny
Pieter Kees Bram Daan Lars Thijs Ruben Jeroen Joost Bas Wouter Maarten Niels Sander Stijn Tim Koen Jesse Femke Sanne
Lieke Anouk Fleur Noor Esther Marieke Anneke Willem Hendrik Henk Gerrit Johan Dirk Bert Casper Coen Eline Esmee Evert
Fenna Frank Frans Freek Geert Gijs Hanneke Jaap Jasper Jelle Joris Jos Kim Klaas Luuk Maaike Marjolein Martijn Mees
Merel Michiel Nienke Noa Pim Roel Rutger Sem Sjoerd Tijn Wim
Anders Nils Ole Freja Linnea Maja Elsa Birgitta Bjørn Björn Gustav Kristian Magnus Mats Olof Ulf
Piotr Paweł Krzysztof Tomasz Marek Jakub Katarzyna Agnieszka Małgorzata Joanna Agata Aleksander Aleksandra Bartosz
Beata Dariusz Dorota Ewa Grzegorz Halina Jacek Jadwiga Janusz Jerzy Józef Kamil Karol Krystyna Łukasz Maciej Marcin
Mariusz Michał Natalia Rafał Stanisław Szymon Tadeusz Wojciech Zbigniew Zofia
Jiří Petr Pavel Tomáš Lucie Tereza Jaroslav Kateřina Lenka Markéta Michal Miroslav Ondřej Radek Václav Vojtěch Zdeněk
Hana
László Zoltán Gábor Katalin Attila Balázs Bence Csaba Dániel Erzsébet Ferenc György Ildikó István János Judit Mária
Márton Péter Sándor Szilvia Tamás Zsófia Zsuzsanna
Alexandru Andreea Bogdan Cristian Gheorghe Ioana Ionuț Mihai Mihaela Radu Răzvan Vasile
Ivana Ivan Marko Ana Nikola Dragan Jelena Aleksandar Bojan Dejan Dušan Goran Jovana Jovan Marija Milica Miloš Nemanja
Petar Snežana Srđan Vesna Zoran Željko Amra Edin Emir Haris Lejla Mirza Selma Senad Amela Jure Matej Mojca Špela
Tadej Urška Žiga Arben Besa Blerim Bujar Dritan Elira Fatmir Ilir Kujtim
Mehmet Ahmet Mustafa Ali Hasan Hüseyin Emre Murat Ayşe Fatma Emine Zeynep Elif Merve Yusuf Aylin Burak Cem Deniz Ebru
Esra Gökhan Hakan Hatice Hülya İbrahim İsmail Kemal Kübra Melek Ömer Özlem Recep Selin Serkan Sevgi Sibel Tuğba
Volkan Yasemin Zehra
Ahmad Ahmed Amir Amira Fatima Hassan Hussein Ibrahim Karim Khalid Layla Leila Mahmoud Mariam Mohamed Mohammed
Muhammad Nadia Omar Rania Samir Yasmin Youssef Zainab Aisha
Alexei Anastasia Andrei Boris Dmitri Ekaterina Igor Irina Kirill Natalja Nikolai Oksana Olga Sergei Svetlana Tatiana
Vladimir Yulia Olena Oleksandr Mykola Taras Andriy
Dimitrios Georgios Ioannis Konstantinos Nikos Eleni Katerina Vasileios
Hiroshi Takashi Kenji Yuki Yuko Akiko Haruto Sakura Yumi Kenta Satoshi Naoko Wei Ming Jing Xiao Priya Rahul Amit
Anjali Arjun Deepak Neha Pooja Ravi Sanjay Sunita Vikram
`;

export const FIRST_NAMES: ReadonlySet<string> = new Set(words(FIRST_NAMES_RAW));

// Vornamen, die kleingeschrieben auch normale Wörter sind ("max 4 Personen", "otto" = acht, "mia" = meine).
// Kleingeschrieben werden sie deshalb nie als Name gewertet.
export const LOWERCASE_UNSAFE_NAMES: ReadonlySet<string> = new Set(
  words(`max mia otto ali vera rosa chiara serena aurora bianca ben fleur sara roman reiner jack bas jan pascal grace holly
  heather molly frank kim robin jean jordan rob bob ella clara regina victoria deniz melek sevgi yasemin mees sandy`),
);

// Großgeschriebene Wörter, die nach einem Vornamen stehen können, aber kein Nachname sind.
const NOT_SURNAME_RAW = `
Ich Wir Sie Er Es Die Der Das Den Dem Des Ein Eine Einen Einem Einer Und Oder Aber Mit Von Vom Für Bei Im In Am An
Auf Aus Nach Zum Zur Ist Hat War Wird Hier Dort Danke Vielen Liebe Lieber Hallo Hi Hey Guten Gruß Grüße Grüßen
Hotel Zimmer Doppelzimmer Einzelzimmer Familienzimmer Suite Anreise Abreise Ankunft Buchung Anfrage Reservierung
Rechnung Angebot Telefon Tel Mobil Handy Fax Email Mail Adresse Straße Strasse Gasse Weg Platz Firma Kunde Kundin
Lieferant Team Montag Dienstag Mittwoch Donnerstag Freitag Samstag Sonntag Januar Jänner Februar Feber März April Mai
Juni Juli August September Oktober November Dezember Jahre Jahren Jahr Monate Wochen Tage Nächte Nacht Uhr Euro EUR
Stück Personen Erwachsene Kinder Kind Frühstück Halbpension Vollpension Parkplatz Garage Hund Allergie
Zeit Urlaub Hause Haus Heim Berg Berge Tal See Bus Bahn Zug Auto Wagen Taxi Flug Flughafen Bahnhof Pension Tag
Abend Morgen Mittag Woche Monat Arbeit Büro Schule Familie Freunde Freund Freundin Hilfe Frage Fragen Problem
Probleme Fehler Rechnungen Geld Preis Preise Kosten Ende Anfang Termin Termine Besuch Essen Mittagessen Abendessen
Dienst Ruhe Stress Sorge Sorgen Lust Spaß Glück Pech Recht Wetter Schnee Regen Sonne Wind Winter Sommer Frühling
Herbst Ski Skier Lift Lifte Piste Wanderung Ausflug Reise Bestätigung Auftrag Bestellung Lieferung Zahlung Anzahlung
Storno Konto Karte Kreditkarte Gepäck Koffer Balkon Terrasse Garten Sauna Pool Bad Dusche Küche Keller Lage Blick
Aussicht Nähe Zentrum Stadt Dorf Ort Land Gemeinde Region Kirche Museum Restaurant Café Menü Speisekarte Getränke
Wein Bier Wasser Kaffee Tee Kuchen Torte Brot Fleisch Fisch Gemüse Obst Käse Milch Eis Party Feier Hochzeit
Geburtstag Jubiläum Seminar Tagung Meeting Besprechung Sitzung Vortrag Kurs Training Turnier Spiel Konzert
Veranstaltung Event Programm Plan Liste Info Infos Information Informationen Nachricht Nachrichten Brief Post Paket
Nummer Name Namen Unterschrift Datum Uhrzeit Minute Minuten Stunde Stunden Moment Wochenende Feiertag Feiertage
Ferien Saison Hauptsaison Nebensaison Gruppe Person Gäste Gast Kunden Chef Chefin Mitarbeiter Mitarbeiterin Personal
Rezeption Service Qualität Bewertung Beschwerde Lob Dank Ihnen Euch Bitte Leider Gerne Natürlich Selbstverständlich
Vielleicht Heute Gestern Vormittag Nachmittag Ostern Weihnachten Silvester Pfingsten Fasching Advent Kollege Kollegin
Assistenz Geschäftsführung Geschäftsführer Geschäftsführerin Leitung Verwaltung Buchhaltung Abteilung Vertrieb
Marketing Einkauf Technik Hausmeister Küchenchef Direktion Rezeptionist Rezeptionistin Obmann Vorstand Sekretariat
The And Or With From To For At On Of By Dear Hello Thanks Thank Regards Best Kind Room Rooms Booking Reservation
Arrival Departure Breakfast Dinner Lunch Night Nights Day Days Week Weekend Month Year Please Sorry Yes No Today
Tomorrow Yesterday Morning Evening Afternoon Street Road Floor Car Parking Train Airport Flight Family Friends
Children Kids Wife Husband Son Daughter Mother Father Group Price Prices Invoice Payment Deposit Card Credit Account
Number Phone Address Date Time Grazie Saluti Buongiorno Buonasera Camera Camere Notte Notti Giorno Giorni Settimana
Prenotazione Arrivo Partenza Colazione Cena Pranzo Famiglia Moglie Marito Figlio Figlia
Cheers Servus Ciao Tschüss Saluti Grazie Groetjes Groeten Bye Love Xoxo LG VG MfG GLG Herzlich Herzliche Beste
`;

export const NOT_SURNAME: ReadonlySet<string> = new Set(words(NOT_SURNAME_RAW));

// Orte beginnen oft mit Wörtern, die sonst kein Ortsname wären ("Bad Ischl", "Maria Alm", "Hall in Tirol").
export const PLACE_PREFIXES: ReadonlySet<string> = new Set(
  words(`Bad Sankt St Markt Maria Hall Neu Alt Ober Unter Groß Klein Hohen Kirch Stadt Hof Wald Berg See Lienz`),
);

// Wörter, die nach "Herr"/"Frau" stehen können, aber kein Name sind.
export const NOT_NAME_AFTER_SALUTATION: ReadonlySet<string> = new Set(
  words(`Doktor Professor Professorin Magister Magistra Direktor Direktorin Kollege Kollegin Bürgermeister
   Bürgermeisterin Präsident Präsidentin Minister Ministerin Abgeordneter Abgeordnete Rat Rätin Pfarrer Ober Wirtin Wirt
   Chef Chefin und oder Gast Kunde Kundin Nachbar Nachbarin Mitarbeiter Mitarbeiterin Vorsitzender Vorsitzende`),
);

// Nachnamen, die auch gewöhnliche Hauptwörter sind. Nach einem Artikel ("den Koch", "auf den Berg") sind sie
// meist das Hauptwort und werden dort nicht als Name nachgezogen.
export const NOUN_SURNAMES: ReadonlySet<string> = new Set(
  words(`Koch Berg Bauer Fischer Jäger Wolf Fuchs Hahn Vogel Strauß Winter Sommer Kaiser König Graf Richter Gärtner
   Maurer Metzger Bäcker Wirt Stein Bach Meister Schmied Schäfer Fleischer Kellner Förster Fink Adler Engel Stern Mond
   Sonne Rose Busch Wald Feld Hof Haus Baum Brand Hirsch Bär Löwe Falke Pfarrer Herzog Ritter Wächter Schreiber`),
);

// Kleingeschrieben gewöhnliche Wörter, die auch Namen sind ("Peter Klein" – "ein klein wenig", "Grace Park" –
// "in the park"). Kleingeschrieben werden sie nicht als Wiederholung eines Namens ersetzt.
export const COMMON_LOWERCASE_WORDS: ReadonlySet<string> = new Set(
  words(`klein lang lange kurz groß gross jung alt neu braun schwarz weiß weiss rot roth grün frank frei fromm froh
   stark wild mild hart fest bald gut ernst still voll warm kühn weise gerade rasch treu lieb hell scharf fein schmal
   breit hoch tief nett rein reich arm kalt süß sauer bitter edel kraft krause kraus koch busch fuchs wolf stock
   will may mark bill rose grant hope young long short white black brown green gray grey little small strong rich
   noble bright sharp swift wise wells park king bell cook baker walker turner hunter fisher carter cooper ward hall
   gates rivers banks moore lane street field west east north south page case bush fox hart day march price stone
   love joy faith grace dawn summer winter spring storm snow frost rain glass steel iron gold silver cash wood hill
   bianco bianca bianchi rosso rossi nero neri bello bella santo santi conte forte grande piccolo
   groot jong smit visser bakker de`),
);

// Artikel, Possessiv- und Demonstrativwörter vor Hauptwörtern.
export const DETERMINERS: ReadonlySet<string> = new Set(
  words(`der die das den dem des ein eine einen einem einer eines kein keine keinen keinem keiner mein meine meinen
   meinem meiner dein deine deinen sein seine seinen seinem ihr ihre ihren ihrem unser unsere unseren unserem euer
   eure euren eurem dies diese diesen diesem dieser jeder jede jeden jedem welcher welche welchen auf zum zur vom beim
   im am the a an my your his her our their this that these those il lo la le gli un una uno het een`),
);

// Kleingeschriebene Allerweltswörter: nach einem kleingeschriebenen Vornamen endet der Name hier.
export const LOWERCASE_STOPWORDS: ReadonlySet<string> = new Set(
  words(`und oder aber mit von vom zu zum zur im in am an auf aus bei nach für über unter vor hinter neben zwischen
   durch gegen ohne um bis seit während wegen trotz der die das den dem des ein eine einen einem einer eines kein keine
   ich du er sie es wir ihr mich dich sich uns euch mir dir ihm ihn ihnen mein meine dein sein unser euer ist sind war
   waren hat haben hatte wird werden kann können muss soll will möchte bitte danke ja nein nicht auch noch schon nur
   sehr so wie was wer wo wann warum dass ob wenn weil als da dann hier dort heute morgen gestern jetzt gerne gern mal
   vielleicht also eben halt doch ganz viel mehr wieder immer the and or with from to for at on of by is are was were be
   have has had will would can could i you he she it we they me him her us them my your his our their this that a an
   not no yes please thanks il la lo le gli un una uno e o di da del della che per con su al alla è sono de het een en
   van met voor op aan bij uit naar zijn ik je wij zij niet ook maar lg vg mfg hallo hi hey servus ciao tschüss grüße
   gruß liebe lieber viele beste herzliche vielen dank cheers regards`),
);

// Wörter in Absendernamen, die auf eine Abteilung statt auf eine Person hindeuten ("Booking Team").
export const ROLE_WORDS: ReadonlySet<string> = new Set(
  words(`Team Service Support Info Office Reservations Reservation Reservierung Reservierungen Booking Bookings
   Rezeption Buchhaltung Verwaltung Newsletter Noreply Kundenservice Kundendienst Vertrieb Sales Marketing Einkauf
   Personal Personalabteilung Sekretariat Zentrale Helpdesk Hotline Abteilung Department Desk Customer Guest Relations
   Front Accounting Billing Admin Administration System Mailer Notification Benachrichtigung Portal`),
);

// Wörter am Anfang von Betriebsnamen ("Gasthof Sonnhof", "Pension Alpenblick").
export const BUSINESS_WORDS: ReadonlySet<string> = new Set(
  words(`Gasthof Gasthaus Pension Hotel Restaurant Café Cafe Bäckerei Konditorei Metzgerei Fleischerei Tischlerei
   Schreinerei Druckerei Brauerei Apotheke Praxis Ordination Kanzlei Autohaus Reisebüro Weingut Bauernhof Alm Hütte
   Camping Appartements Appartement Ferienwohnungen Chalet Residenz Salon Friseur Boutique Agentur Atelier Werkstatt
   Garage Tankstelle Verein Club Albergo Ristorante Trattoria Pizzeria Bar Gästehaus Landhaus Berghof`),
);

// Monatsnamen (deutsch, englisch, italienisch, niederländisch), z. B. für "2027 Februar" ist keine Adresse.
export const MONTHS: ReadonlySet<string> = new Set(
  words(`Januar Jänner Februar Feber März April Mai Juni Juli August September Oktober November Dezember January
   February March May June July October December Gennaio Febbraio Marzo Aprile Maggio Giugno Luglio Agosto Settembre
   Ottobre Novembre Dicembre Januari Februari Maart Juni Juli Augustus Oktober`),
);
