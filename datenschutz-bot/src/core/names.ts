// Häufige Vornamen aus den Herkunftsländern typischer Gäste und Geschäftspartner
// (DACH, Italien, Niederlande, englischsprachige Länder, Osteuropa, Türkei, Skandinavien).
// Bewusst weggelassen: Namen, die auch normale Wörter sind (Mark, Will, May, Rose, Iris, Kai, Ernst ...).
const FIRST_NAMES_RAW = `
Anna Maria Lena Lea Leonie Laura Sarah Sara Julia Katharina Sophie Sophia Sofia Hannah Hanna Emma Mia Emilia Lina
Marie Johanna Elisabeth Theresa Teresa Magdalena Christina Christine Sabine Andrea Petra Claudia Monika Barbara
Susanne Stefanie Stephanie Nicole Melanie Martina Birgit Brigitte Gabriele Karin Renate Ingrid Ursula Helga Gertrud
Elfriede Hildegard Erika Margarete Rosa Franziska Veronika Verena Viktoria Valentina Nina Lisa Eva Elena Carina
Corinna Jasmin Jessica Jennifer Vanessa Selina Sandra Daniela Manuela Michaela Silvia Simone Tanja Bettina Doris Elke
Heidi Jana Katrin Kathrin Kerstin Sonja Ulrike Anja Alexandra Anita Angelika Astrid Bianca Cornelia Diana Elisa
Emily Fabienne Helena Isabella Ida Ines Irene Jacqueline Josefine Klara Clara Larissa Lara Leni Luisa Louisa Magda
Marlene Mathilda Miriam Natalie Nadine Olivia Paula Pia Rebecca Regina Romana Ronja Ruth Sabrina Stella Svenja
Tamara Theresia Vera Waltraud Yvonne Zoe Antonia Agnes Annemarie Charlotte Ella Frieda Greta Hedwig Josefa Juliane
Lotte Luise Martha Rosemarie Thea Hilde Irmgard Gisela
Thomas Michael Andreas Stefan Stephan Christian Markus Marcus Martin Peter Alexander Daniel Florian Tobias Matthias
Mathias Johannes Josef Joseph Johann Franz Karl Carl Georg Wolfgang Herbert Helmut Gerhard Günter Günther Manfred
Werner Walter Jürgen Klaus Dieter Bernhard Bernd Robert Richard Rudolf Roland Reinhard Harald Heinz Hans Hermann
Horst Gerald Gernot Hubert Anton Alois Leopold Ludwig Lukas Lucas Jakob Jonas Leon Paul Felix Maximilian Max Elias
Noah Ben Luca Luka Moritz Simon David Fabian Julian Sebastian Philipp Philip Patrick Dominik Kevin Marcel Mario
Marco Manuel Niklas Nikolaus Oliver Oskar Oscar Pascal Raphael Rafael Valentin Vincent Benjamin Benedikt Bastian
Christoph Clemens Dennis Erich Erwin Ewald Ferdinand Fritz Friedrich Gabriel Gregor Hannes Heinrich Jan Jens Jörg
Kurt Lorenz Matteo Nico Norbert Otto Reinhold Siegfried Sven Theo Theodor Ulrich Uwe Viktor Wilhelm Willi Armin
Arnold Benno Emil Erik Eric Konrad Konstantin Lennart Leonhard Marius Mathis Rainer Reiner René Rene Roman
Samuel Severin
Giuseppe Giovanni Francesco Antonio Alessandro Lorenzo Leonardo Riccardo Davide Federico Stefano Paolo Roberto
Giulia Francesca Chiara Federica Alessia Giorgia Aurora Ginevra Beatrice Alice Camilla Serena Roberta
Pieter Kees Bram Daan Lars Thijs Ruben Jeroen Joost Bas Wouter Maarten Niels Sander Stijn Tim Koen Jesse Femke
Sanne Lieke Anouk Fleur Noor Esther Ilse Marieke Anneke Willem Hendrik Henk Gerrit Johan Dirk
James John William Charles Christopher Matthew Anthony Andrew Joshua Brian George Edward Ryan Jacob Nicholas
Jonathan Stephen Steven Harry Jack Liam Ethan Mary Patricia Linda Elizabeth Susan Karen Nancy Margaret Ashley
Michelle Amanda Melissa Amy Amelia Chloe Lucy Kate Katherine Catherine Victoria Rachel Helen
Piotr Paweł Krzysztof Tomasz Marek Jakub Katarzyna Agnieszka Małgorzata Joanna Jiří Petr Pavel Tomáš Lucie Tereza
László Zoltán Gábor Katalin Ivana Ivan Marko Ana Nikola Milan Dragan Jelena
Mehmet Ahmet Mustafa Ali Hasan Hüseyin Emre Murat Ayşe Fatma Emine Zeynep Elif Merve Yusuf
Anders Nils Ole Freja Linnea Maja Elsa
`;

export const FIRST_NAMES: ReadonlySet<string> = new Set(FIRST_NAMES_RAW.split(/\s+/).filter(Boolean));

// Großgeschriebene Wörter, die nach einem Vornamen stehen können, aber kein Nachname sind.
const NOT_SURNAME_RAW = `
Ich Wir Sie Er Es Die Der Das Den Dem Des Ein Eine Einen Einem Einer Und Oder Aber Mit Von Vom Für Bei Im In Am An
Auf Aus Nach Zum Zur Ist Hat War Wird Hier Dort Danke Vielen Liebe Lieber Hallo Hi Hey Guten Gruß Grüße Grüßen
Hotel Zimmer Doppelzimmer Einzelzimmer Suite Anreise Abreise Ankunft Buchung Anfrage Reservierung Rechnung Angebot
Telefon Tel Mobil Handy Fax Email Mail Adresse Straße Strasse Gasse Weg Platz Firma Kunde Kundin Lieferant Team
Montag Dienstag Mittwoch Donnerstag Freitag Samstag Sonntag Januar Februar März April Mai Juni Juli August
September Oktober November Dezember Jahre Jahren Jahr Monate Wochen Tage Nächte Nacht Uhr Euro EUR Stück Personen
Erwachsene Kinder Kind Frühstück Halbpension Vollpension Parkplatz Garage Hund Allergie
The And Or With From To For At On In Of By Dear Hello Thanks Thank Regards Best Kind Hotel Room
`;

export const NOT_SURNAME: ReadonlySet<string> = new Set(NOT_SURNAME_RAW.split(/\s+/).filter(Boolean));

// Wörter, die nach "Herr"/"Frau" stehen können, aber kein Name sind.
export const NOT_NAME_AFTER_SALUTATION: ReadonlySet<string> = new Set(
  `Doktor Professor Professorin Magister Magistra Direktor Direktorin Kollege Kollegin Bürgermeister Bürgermeisterin
   Präsident Präsidentin Minister Ministerin Abgeordneter Abgeordnete Rat Rätin Pfarrer Ober Wirtin Wirt Chef Chefin
   und oder`
    .split(/\s+/)
    .filter(Boolean),
);
