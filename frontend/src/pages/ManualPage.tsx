import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { APP_VERSION, CHANGELOG } from '../version'

/* In-app user manual (Οδηγίες). One tab per area of the app; the last tab is the
   version + changelog (src/version.ts). Screenshots live in public/manual/*.png|jpg and
   were captured from the demo store — a missing image simply doesn't render.
   Keep this in sync with the UI: any user-visible change → update the relevant tab. */

type Section = { key: string; title: string; body: ReactNode }

/** ISO yyyy-mm-dd → dd/mm/yyyy (the changelog and build date are stored ISO). */
function elDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function Shot({ src, alt, caption, narrow }: { src: string; alt: string; caption?: string; narrow?: boolean }) {
  const [missing, setMissing] = useState(false)
  if (missing) return null
  return (
    <figure className={narrow ? 'manual-shot manual-shot-narrow' : 'manual-shot'}>
      <img src={`/manual/${src}`} alt={alt} loading="lazy" onError={() => setMissing(true)} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

const Kbd = ({ children }: { children: ReactNode }) => <kbd className="manual-kbd">{children}</kbd>
const Btn = ({ children }: { children: ReactNode }) => <span className="manual-btn">{children}</span>

const SECTIONS: Section[] = [
  {
    key: 'overview',
    title: 'Γενικά',
    body: (
      <>
        <h3>Τι είναι η εφαρμογή</h3>
        <p>
          Η εφαρμογή «Σχέδια ΥΠΕΠΑ» είναι το ηλεκτρονικό αρχείο των τεχνικών σχεδίων. Αντικαθιστά την
          παλιά εφαρμογή σάρωσης, διαβάζει και γράφει στους <strong>ίδιους πίνακες</strong> της βάσης, οπότε
          όλα τα ήδη αρχειοθετημένα σχέδια είναι διαθέσιμα αμέσως. Δουλεύει μέσα από τον φυλλομετρητή
          (Chrome, Edge, Firefox) χωρίς εγκατάσταση.
        </p>
        <h3>Σύνδεση</h3>
        <p>
          Στη σελίδα σύνδεσης δίνετε <strong>Όνομα χρήστη</strong> (ο ΑΜΑ σας), <strong>Κωδικό</strong> και, όπου
          ζητείται, την <strong>Κατηγορία προσωπικού</strong>. Τα στοιχεία είναι τα ίδια με τις υπόλοιπες
          εφαρμογές MIS. Το εικονίδιο του ματιού δείχνει/κρύβει τον κωδικό.
        </p>
        <Shot src="login.png" narrow alt="Σελίδα σύνδεσης" caption="Σελίδα σύνδεσης" />
        <p>
          Η σύνοδος παραμένει ενεργή όσο δουλεύετε (ανανεώνεται αυτόματα) και λήγει μετά από μακρά
          αδράνεια ή, το αργότερο, 12 ώρες μετά τη σύνδεση. Αν λήξει, η εφαρμογή σάς επιστρέφει στη σελίδα
          σύνδεσης και, μόλις συνδεθείτε ξανά, <strong>σας ξαναπηγαίνει εκεί που ήσασταν</strong>.
        </p>
        <h3>Δικαιώματα</h3>
        <p>
          Ισχύουν τα <strong>ίδια δικαιώματα με την παλιά εφαρμογή</strong> σάρωσης (δεν ορίζονται μέσα
          από την εφαρμογή). Ό,τι δεν σας επιτρέπεται απλώς <strong>δεν εμφανίζεται</strong>:
        </p>
        <ul>
          <li><strong>Προβολή Σχεδίων</strong> — απαραίτητο για να συνδεθείτε· αναζήτηση, λίστα, προβολή.</li>
          <li><strong>Σάρωση Σχεδίων</strong> — Καταχώριση σχεδίου και Μαζική καταχώριση.</li>
          <li><strong>Εκτύπωση Σχεδίων</strong> — «Λήψη πρωτοτύπου» (η εκτύπωση γίνεται από το κατεβασμένο αρχείο).</li>
          <li><strong>Επεξεργασία Σχεδίου</strong> — Επεξεργασία στοιχείων και Διαγραφή σχεδίου.</li>
          <li><strong>Διαχειριστής Εφαρμογής</strong> — Λίστες επιλογών, και όλα τα παραπάνω.</li>
        </ul>
        <p>
          Για να δείτε τι σας έχει δοθεί, ανοίξτε το <strong>μενού χρήστη</strong> (το ονοματεπώνυμό σας, πάνω δεξιά):
          η ενότητα «Δικαιώματα» δείχνει και τα πέντε — με <strong>✓</strong> όσα έχετε και αχνά όσα όχι.
          Ο Διαχειριστής Εφαρμογής έχει αυτόματα όλα τα υπόλοιπα.
        </p>
        <Shot src="user-menu.png" narrow alt="Μενού χρήστη με τη λίστα δικαιωμάτων"
              caption="Μενού χρήστη: δικαιώματα (εδώ χωρίς «Διαχειριστής» και «Εκτύπωση» — η καρτέλα «Λίστες επιλογών» δεν εμφανίζεται) και επιλογή εμφάνισης" />
        <div className="note-box">
          <span className="note-label">Σημείωση</span>
          Αν λείπει κάποιο κουμπί που περιγράφεται στις οδηγίες (π.χ. «Καταχώριση», «Διαγραφή», «Λίστες
          επιλογών»), δεν έχετε το αντίστοιχο δικαίωμα.
        </div>
        <h3>Η κεφαλίδα</h3>
        <ul>
          <li>Το έμβλημα / «Σχέδια ΥΠΕΠΑ» οδηγεί στην Αρχική.</li>
          <li><strong>Αρχική</strong> — στατιστικά του αρχείου και γρήγορες ενέργειες.</li>
          <li><strong>Σχέδια</strong> — αναζήτηση, λίστα, καταχώριση.</li>
          <li><strong>Λίστες επιλογών</strong> — συντήρηση κατηγοριών, ειδών, χώρων αποθήκευσης (μόνο διαχειριστές).</li>
          <li><strong>Οδηγίες</strong> — αυτή η σελίδα. Με <Btn>Εκτύπωση / PDF</Btn> (πάνω δεξιά) όλες οι καρτέλες μπαίνουν σε μία σελίδα και ανοίγει το παράθυρο εκτύπωσης του φυλλομετρητή· εκεί επιλέξτε «Αποθήκευση ως PDF» για να κρατήσετε τις οδηγίες ως αρχείο.</li>
          <li>Δεξιά, το ονοματεπώνυμό σας (όπως το δίνει το MIS) ανοίγει μενού με τα <strong>δικαιώματά</strong> σας, την <strong>Εμφάνιση</strong> (φωτεινό/σκοτεινό θέμα), το <strong>Μέγεθος γραμμάτων</strong>, <strong>Αλλαγή κωδικού</strong>, <strong>Αποσύνδεση</strong> και την έκδοση της εφαρμογής.</li>
        </ul>
        <h3>Εμφάνιση (φωτεινό / σκοτεινό θέμα)</h3>
        <p>
          Στο μενού χρήστη, η επιλογή <strong>Εμφάνιση</strong> έχει τρεις θέσεις: <Btn>Αυτόματο</Btn> ακολουθεί τη
          ρύθμιση των Windows (ανοιχτό/σκούρο θέμα) και αλλάζει μαζί της, <Btn>Φωτεινό</Btn> και{' '}
          <Btn>Σκοτεινό</Btn> το ορίζουν σταθερά. Η επιλογή αποθηκεύεται ανά υπολογιστή/φυλλομετρητή. Η εκτύπωση
          των οδηγιών γίνεται πάντα σε φωτεινό.
        </p>
        <h3>Μέγεθος γραμμάτων</h3>
        <p>
          Στο ίδιο μενού, <strong>Μέγεθος γραμμάτων</strong>: <Btn>Κανονικό</Btn>, <Btn>Μεγάλο</Btn> (+10%) ή{' '}
          <Btn>Πολύ μεγάλο</Btn> (+20%). Μεγαλώνουν τα γράμματα και τα κουμπιά σε όλη την εφαρμογή — εκτός από
          την ίδια την εικόνα του σχεδίου στην προβολή και τη σελίδα σύνδεσης. Αποθηκεύεται ανά υπολογιστή/φυλλομετρητή.
        </p>
        <ul>
        </ul>
        <h3>Αρχική σελίδα</h3>
        <p>
          Δείχνει το σύνολο των σχεδίων και την κατανομή τους ανά κατηγορία έργου, είδος σχεδίου και
          μονάδα. <strong>Κάθε γραμμή είναι σύνδεσμος</strong>: πατώντας π.χ. μια κατηγορία ανοίγει η λίστα
          σχεδίων ήδη φιλτραρισμένη σε αυτήν. Τα κουμπιά κάτω από το σύνολο οδηγούν στη λίστα σχεδίων και —
          για όσους έχουν δικαίωμα σάρωσης — στην καταχώριση και τη μαζική καταχώριση.
        </p>
        <Shot src="home.png" alt="Αρχική σελίδα" caption="Αρχική: στατιστικά και γρήγορες ενέργειες" />
        <div className="note-box">
          <span className="note-label">Σημείωση</span>
          Αν ο διακομιστής δεν αποκρίνεται, εμφανίζεται σχετικό μήνυμα με κουμπί «Δοκιμή ξανά» — δεν
          χάνεται η σελίδα στην οποία βρισκόσασταν.
        </div>
        <h3>Τι δεν κάνει η web εφαρμογή</h3>
        <p>
          Η web εφαρμογή <strong>δεν υποστηρίζει απευθείας σάρωση</strong> από σαρωτή ούτε{' '}
          <strong>εκτύπωση</strong> σχεδίων. Για σάρωση και εκτύπωση χρησιμοποιήστε την εφαρμογή των Windows
          ή το λογισμικό του σαρωτή/εκτυπωτή. Στη web εφαρμογή
          ανεβάζετε το <strong>έτοιμο αρχείο</strong> της σάρωσης (βλ. «Καταχώριση»).
        </p>
      </>
    ),
  },
  {
    key: 'search',
    title: 'Αναζήτηση & λίστα',
    body: (
      <>
        <h3>Αναζήτηση</h3>
        <p>
          Στη σελίδα <strong>Σχέδια</strong> το πάνω πλαίσιο είναι τα φίλτρα. Το πεδίο <strong>Κείμενο</strong>{' '}
          ψάχνει ταυτόχρονα σε αριθμό σχεδίου, κωδικό έργου, τίτλους και περιγραφές· πατήστε{' '}
          <Kbd>Enter</Kbd> ή <Btn>Αναζήτηση</Btn>. Τα υπόλοιπα φίλτρα (κατηγορία, υποκατηγορία, μονάδα,
          είδος, χώρος αποθήκευσης, ημερομηνίες εισαγωγής) εφαρμόζονται αμέσως μόλις τα αλλάξετε.
        </p>
        <ul>
          <li>Στα πεδία επιλογής μπορείτε να <strong>πληκτρολογήσετε</strong> για να φιλτράρετε τη λίστα τιμών· με κλικ στο βέλος ανοίγει ολόκληρη.</li>
          <li>Η <strong>Υποκατηγορία</strong> περιορίζεται αυτόματα στην επιλεγμένη κατηγορία.</li>
          <li>Το φίλτρο <strong>Μονάδα</strong> δείχνει μόνο μονάδες που έχουν σχέδια.</li>
          <li><Btn>Καθαρισμός</Btn> αφαιρεί όλα τα φίλτρα.</li>
        </ul>
        <Shot src="list.png" alt="Λίστα σχεδίων με φίλτρα" caption="Φίλτρα και λίστα αποτελεσμάτων" />
        <h3>Λίστα αποτελεσμάτων</h3>
        <ul>
          <li>Κλικ σε <strong>επικεφαλίδα στήλης</strong> ταξινομεί κατά αύξουσα σειρά, δεύτερο κλικ κατά φθίνουσα, τρίτο επαναφέρει την αρχική σειρά.</li>
          <li><strong>Πλάτος στηλών</strong>: σύρετε το δεξί όριο μιας επικεφαλίδας για να τη μεγαλώσετε ή να τη μικρύνετε. Τα πλάτη αποθηκεύονται στον υπολογιστή σας· <strong>διπλό κλικ</strong> στο ίδιο όριο επαναφέρει μία στήλη, ενώ το κουμπί <Btn>Επαναφορά πλάτους στηλών</Btn> (πάνω από τη λίστα, εμφανίζεται μόλις αλλάξετε πλάτος) επαναφέρει όλες σε αυτόματο πλάτος.</li>
          <li>Ο <strong>αριθμός σχεδίου</strong> (ή το <Btn>Προβολή</Btn>) ανοίγει το σχέδιο.</li>
          <li>Κάτω: σελίδες, πλήθος αποτελεσμάτων και <strong>Ανά σελίδα</strong> (10/20/50/100, προεπιλογή 10 — η επιλογή αποθηκεύεται στον υπολογιστή σας).</li>
          <li>Μακριά κείμενα κόβονται με «…» — αφήστε το ποντίκι πάνω τους για το πλήρες κείμενο.</li>
        </ul>
        <Shot src="list-columns.png" alt="Λίστα με αλλαγμένο πλάτος στήλης και το κουμπί επαναφοράς"
              caption="Αλλαγή πλάτους στήλης: εδώ η στήλη «Τίτλος Σχεδ.» μεγάλωσε — πάνω δεξιά εμφανίζεται η «Επαναφορά πλάτους στηλών»" />
        <div className="note-box">
          <span className="note-label">Συμβουλή</span>
          Φίλτρα, ταξινόμηση και σελίδα αποθηκεύονται στη <strong>διεύθυνση της σελίδας</strong>. Μπορείτε
          να την αντιγράψετε/στείλετε ή να την κρατήσετε στα αγαπημένα· το «Πίσω» του φυλλομετρητή και το
          «Κλείσιμο» του σχεδίου επιστρέφουν στην ίδια ακριβώς λίστα.
        </div>
      </>
    ),
  },
  {
    key: 'view',
    title: 'Προβολή / Επεξεργασία',
    body: (
      <>
        <h3>Προβολή σχεδίου</h3>
        <p>
          Το σχέδιο ανοίγει σε δική του σελίδα (<span className="mono">/drawings/αριθμός</span>, άρα μπορείτε να
          κοινοποιήσετε τη διεύθυνση). Αριστερά η εικόνα, δεξιά τα <strong>Στοιχεία σχεδίου</strong>.
        </p>
        <ul>
          <li><strong>Ζουμ</strong>: ροδέλα ποντικιού, διπλό κλικ ή τα κουμπιά <Btn>−</Btn> / <Btn>+</Btn>. Σύρετε για μετακίνηση. <Btn>Προσαρμογή</Btn> επαναφέρει όλο το σχέδιο στην οθόνη.</li>
          <li><Btn>⟲ 90°</Btn> / <Btn>⟳ 90°</Btn> περιστρέφουν την εικόνα (μόνο για την προβολή — το αρχείο δεν αλλάζει).</li>
          <li>Τα <strong>PDF</strong> δεν περνούν από το ζουμ της εφαρμογής: εμφανίζονται όπως είναι, με τον ενσωματωμένο προβολέα PDF του φυλλομετρητή (δικά του κουμπιά ζουμ/σελίδων/εκτύπωσης)· τα κουμπιά −/+/περιστροφής/προσαρμογής δεν εμφανίζονται. Χωρίς το δικαίωμα «Εκτύπωση Σχεδίων» η γραμμή εργαλείων του προβολέα PDF (λήψη/εκτύπωση) κρύβεται σε Chrome/Edge — το ζουμ γίνεται με <Kbd>Ctrl</Kbd>+ροδέλα. Αν ο φυλλομετρητής δεν έχει προβολέα PDF, χρησιμοποιήστε «Λήψη πρωτοτύπου».</li>
          <li><Btn>Λήψη πρωτοτύπου</Btn> κατεβάζει το αρχικό αρχείο (TIFF/PDF/JPG…) όπως αποθηκεύτηκε.</li>
          <li><Btn>Κλείσιμο</Btn> επιστρέφει στη λίστα, στην ίδια σελίδα/φίλτρα.</li>
          <li>Η εφαρμογή <strong>δεν εκτυπώνει</strong> σχέδια. Για εκτύπωση κατεβάστε το πρωτότυπο («Λήψη πρωτοτύπου») και εκτυπώστε το από την εφαρμογή των Windows ή το πρόγραμμα εικόνας/PDF του υπολογιστή σας.</li>
        </ul>
        <Shot src="viewer.png" alt="Προβολή σχεδίου με τα στοιχεία του" caption="Προβολή: εικόνα με ζουμ και στοιχεία σχεδίου" />
        <p>
          Την <strong>πρώτη φορά</strong> που ανοίγει ένα μεγάλο σχέδιο χρειάζονται 1–3 δευτερόλεπτα για να
          προετοιμαστεί· τις επόμενες ανοίγει αμέσως. Σχέδια σαρωμένα με <strong>παλαιότερους σαρωτές</strong>{' '}
          (παλαιά μορφή συμπίεσης JPEG μέσα στο TIFF) χρειάζονται λίγα δευτερόλεπτα παραπάνω την πρώτη φορά,
          γιατί γίνεται αυτόματη μετατροπή — μετά ανοίγουν άμεσα όπως όλα.
        </p>
        <h3>Επεξεργασία στοιχείων</h3>
        <p>
          Πατήστε <Btn>Επεξεργασία</Btn> στο πλαίσιο «Στοιχεία σχεδίου». Τα πεδία γίνονται επεξεργάσιμα·
          αλλάξτε ό,τι χρειάζεται και πατήστε <Btn>Αποθήκευση</Btn> (ή <Btn>Ακύρωση</Btn>). Το ίδιο το
          αρχείο της εικόνας δεν αλλάζει — μόνο τα στοιχεία (μεταδεδομένα).
        </p>
        <Shot src="edit.png" alt="Φόρμα επεξεργασίας στοιχείων" caption="Επεξεργασία στοιχείων μέσα στον προβολέα" narrow />
        <h3>Διαγραφή</h3>
        <p>
          <Btn>Διαγραφή</Btn> (κόκκινο) ζητά επιβεβαίωση και αφαιρεί το σχέδιο από το αρχείο. Η εγγραφή
          σημειώνεται ως διαγραμμένη και παύει να εμφανίζεται στις αναζητήσεις.
        </p>
      </>
    ),
  },
  {
    key: 'import',
    title: 'Καταχώριση',
    body: (
      <>
        <h3>Καταχώριση ενός σχεδίου</h3>
        <p>
          Από τη σελίδα Σχέδια πατήστε <Btn>+ Καταχώριση σχεδίου</Btn> (ή το κουμπί της Αρχικής). Ανοίγει
          φόρμα με τρεις ενότητες:
        </p>
        <table className="manual-table">
          <tbody>
            <tr><th>Σχέδιο</th><td><strong>Αριθμός σχεδίου</strong> (υποχρεωτικός), Είδος σχεδίου, Τίτλος, Περιγραφή</td></tr>
            <tr><th>Έργο</th><td>Κωδικός έργου, Κατηγορία / Υποκατηγορία έργου, Περιγραφή έργου, Μονάδα, Υπομονάδα</td></tr>
            <tr><th>Πρόσθετες πληροφορίες</th><td>Χώρος αποθήκευσης, Ημερομηνία, <strong>Αρχείο</strong> (υποχρεωτικό)</td></tr>
          </tbody>
        </table>
        <ul>
          <li>Σύρετε το αρχείο στην περιοχή «Σύρετε το αρχείο εδώ» ή πατήστε την για να το επιλέξετε από τον υπολογιστή. Μόλις επιλεγεί, εμφανίζονται το όνομα και το μέγεθός του (MB).</li>
          <li>Δεν γίνεται σάρωση μέσα από τη web εφαρμογή: σαρώστε πρώτα με την εφαρμογή των Windows ή το λογισμικό του σαρωτή, αποθηκεύστε το αρχείο και ανεβάστε το εδώ.</li>
          <li>Κατά την αποστολή φαίνεται η πρόοδος (MB, ποσοστό) και υπάρχει <Btn>Ακύρωση</Btn>.</li>
          <li>Η Μονάδα επιλέγεται από τις μονάδες πρώτου επιπέδου· η Υπομονάδα είναι ελεύθερο κείμενο.</li>
          <li>Ο χρήστης που έκανε την καταχώριση και η ημερομηνία εισαγωγής καταγράφονται αυτόματα.</li>
        </ul>
        <Shot src="import.png" alt="Φόρμα καταχώρισης σχεδίου" caption="Φόρμα καταχώρισης σχεδίου" />

        <h3 id="file-types">Υποστηριζόμενοι τύποι αρχείων</h3>
        <p>
          Ο τύπος αναγνωρίζεται από το <strong>περιεχόμενο</strong> του αρχείου (όχι μόνο από την κατάληξη),
          οπότε ένα λάθος μετονομασμένο αρχείο απορρίπτεται με σαφές μήνυμα αντί να αποθηκευτεί χαλασμένο.
        </p>
        <table className="manual-table manual-filetypes">
          <thead>
            <tr><th>Τύπος</th><th>Καταλήξεις</th><th>Πότε χρησιμοποιείται</th><th>Προβολή</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>TIFF</strong></td><td className="mono">.tif .tiff</td><td>Το κλασικό αποτέλεσμα σάρωσης σχεδίων (ασπρόμαυρο, μεγάλες διαστάσεις)· ο κύριος όγκος του αρχείου. Γίνονται δεκτά και TIFF από παλαιότερους σαρωτές (παλαιά συμπίεση JPEG).</td><td>Ζουμ ανά τμήματα (tiles)</td></tr>
            <tr><td><strong>PDF</strong></td><td className="mono">.pdf</td><td>Σαρωτές με scan-to-PDF, κινητό (π.χ. Microsoft Lens), εξαγωγή από σχεδιαστικά προγράμματα. Πολυσέλιδα PDF αποθηκεύονται ολόκληρα.</td><td>Ενσωματωμένος προβολέας PDF του φυλλομετρητή (όχι το ζουμ της εφαρμογής)</td></tr>
            <tr><td><strong>JPEG</strong></td><td className="mono">.jpg .jpeg</td><td>Φωτογραφίες σχεδίων, έγχρωμες σαρώσεις.</td><td>Ζουμ ανά τμήματα</td></tr>
            <tr><td><strong>PNG</strong></td><td className="mono">.png</td><td>Εξαγωγές από υπολογιστή, στιγμιότυπα.</td><td>Ζουμ ανά τμήματα</td></tr>
            <tr><td>GIF, BMP, WebP</td><td className="mono">.gif .bmp .webp</td><td>Σπανιότεροι τύποι εικόνας — γίνονται δεκτοί.</td><td>Ζουμ ανά τμήματα</td></tr>
          </tbody>
        </table>
        <ul>
          <li><strong>Δεν γίνονται δεκτά</strong>: DWG/DXF (AutoCAD), Word/Excel, ZIP κ.λπ. Εξάγετέ τα πρώτα σε PDF ή εικόνα.</li>
          <li>Μέγιστο μέγεθος αρχείου: <strong>500 MB</strong>.</li>
          <li>Το πρωτότυπο αποθηκεύεται <strong>ακριβώς όπως ανέβηκε</strong> και κατεβαίνει από το «Λήψη πρωτοτύπου».</li>
        </ul>
        <div className="note-box">
          <span className="note-label">Σημείωση</span>
          Τα στοιχεία μπορούν να διορθωθούν αργότερα από την Προβολή → Επεξεργασία. Το αρχείο δεν αντικαθίσταται·
          αν ανέβηκε λάθος αρχείο, διαγράψτε το σχέδιο και καταχωρίστε το ξανά.
        </div>
      </>
    ),
  },
  {
    key: 'mass',
    title: 'Μαζική καταχώριση',
    body: (
      <>
        <h3>Πολλά αρχεία μαζί</h3>
        <p>
          Από τη σελίδα Σχέδια πατήστε <Btn>Μαζική καταχώριση</Btn>. Χρησιμεύει όταν έχετε πολλά αρχεία
          του ίδιου έργου/μονάδας: συμπληρώνετε τα κοινά στοιχεία <strong>μία φορά</strong> και κάθε αρχείο
          καταχωρίζεται ως ξεχωριστό σχέδιο.
        </p>
        <ol className="manual-steps">
          <li><strong>Κοινά στοιχεία</strong> — ανοίξτε την ενότητα και συμπληρώστε ό,τι ισχύει για όλα τα αρχεία (είδος, έργο, κατηγορία, μονάδα, χώρος αποθήκευσης…).</li>
          <li><strong>Αρχεία</strong> — <Btn>+ Προσθήκη αρχείων</Btn> ή σύρετε πολλά αρχεία στον πίνακα. Για καθένα συμπληρώστε τον <strong>Αριθμό σχεδίου</strong> (υποχρεωτικός). Ισχύουν οι ίδιοι τύποι αρχείων με την απλή καταχώριση.</li>
          <li>Όπου ένα αρχείο διαφέρει, πατήστε το βέλος <Btn>▸</Btn> στη γραμμή του για να <strong>διαφοροποιήσετε</strong> συγκεκριμένα πεδία· τα υπόλοιπα κληρονομούνται από τα κοινά («Επαναφορά στα κοινά» τα ξανασυνδέει με τα κοινά στοιχεία).</li>
          <li><Btn>Καταχώριση N αρχείων</Btn> — τα αρχεία ανεβαίνουν <strong>ένα-ένα</strong>· η στήλη «Κατάσταση» δείχνει πρόοδο, επιτυχία ή σφάλμα ανά αρχείο.</li>
        </ol>
        <Shot src="mass-import.png" alt="Φόρμα μαζικής καταχώρισης" caption="Μαζική καταχώριση: κοινά στοιχεία και αρχεία με κατάσταση" />
        <ul>
          <li><Btn>Διακοπή</Btn> σταματά μετά το τρέχον αρχείο· ό,τι ολοκληρώθηκε έχει ήδη καταχωριστεί.</li>
          <li>Αρχεία με σφάλμα μένουν στον πίνακα για διόρθωση και επανάληψη· <Btn>Απόκρυψη καταχωρισμένων</Btn> καθαρίζει τα επιτυχημένα.</li>
          <li>Τα σχέδια που καταχωρίστηκαν μαζικά σημειώνονται ως τέτοια στη βάση (MAZIKI_KATAXWRISI).</li>
        </ul>
      </>
    ),
  },
  {
    key: 'lookups',
    title: 'Λίστες επιλογών',
    body: (
      <>
        <h3>Συντήρηση λιστών</h3>
        <p>
          Η σελίδα <strong>Λίστες επιλογών</strong> διαχειρίζεται τις τιμές που εμφανίζονται στα πεδία επιλογής
          της αναζήτησης και της καταχώρισης: <strong>Είδη σχεδίου</strong>, <strong>Κατηγορίες έργου</strong>,{' '}
          <strong>Υποκατηγορίες έργου</strong> (καθεμία ανήκει σε μία κατηγορία) και <strong>Χώροι αποθήκευσης</strong>.
        </p>
        <ul>
          <li>Επιλέξτε λίστα από τις καρτέλες· ο αριθμός δίπλα είναι το πλήθος των τιμών.</li>
          <li><strong>Προσθήκη</strong>: γράψτε το όνομα στο κάτω πεδίο (και κατηγορία για υποκατηγορία) και πατήστε <Btn>Προσθήκη</Btn>.</li>
          <li><strong>Μετονομασία</strong>: <Btn>Επεξεργασία</Btn> στη γραμμή, αλλαγή, <Btn>Αποθήκευση</Btn>. Η νέα ονομασία εμφανίζεται σε όλα τα σχέδια που τη χρησιμοποιούν, παλιά και νέα.</li>
          <li><strong>Διαγραφή</strong>: επιτρέπεται μόνο αν καμία εγγραφή δεν χρησιμοποιεί την τιμή.</li>
          <li>Στις υποκατηγορίες υπάρχει φίλτρο ανά κατηγορία για να τις βρίσκετε πιο εύκολα.</li>
        </ul>
        <Shot src="lookups.png" alt="Σελίδα λιστών επιλογών" caption="Λίστες επιλογών" />
        <div className="note-box">
          <span className="note-label">Σημείωση</span>
          Οι <strong>Μονάδες</strong> προέρχονται από την κεντρική δομή μονάδων του MIS και δεν
          επεξεργάζονται εδώ.
        </div>
      </>
    ),
  },
  {
    key: 'version',
    title: 'Έκδοση & αλλαγές',
    body: (
      <>
        <div className="manual-version">
          <div>
            <span className="manual-version-label">Τρέχουσα έκδοση</span>
            <span className="manual-version-no mono">v{APP_VERSION}</span>
          </div>
          <div>
            <span className="manual-version-label">Ημερομηνία build</span>
            <span className="mono">{elDate(__BUILD_DATE__)}</span>
          </div>
        </div>
        <h3>Ιστορικό αλλαγών</h3>
        {CHANGELOG.map((c) => (
          <section key={c.version} className="changeset">
            <header>
              <span className="mono changeset-ver">v{c.version}</span>
              <span className="mono changeset-date">{elDate(c.date)}</span>
              {c.title && <span className="changeset-title">{c.title}</span>}
            </header>
            {c.intro && <p>{c.intro}</p>}
            <ul>
              {c.changes.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          </section>
        ))}
      </>
    ),
  },
]

export default function ManualPage() {
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('tab')
  const valid = (k: string | null) => SECTIONS.some((s) => s.key === k)
  const [selected, setSelected] = useState(valid(fromUrl) ? fromUrl! : SECTIONS[0].key)
  // ?tab=… changed from outside (user menu "Έκδοση", back/forward): follow it.
  useEffect(() => { if (valid(fromUrl) && fromUrl !== selected) setSelected(fromUrl!) }, [fromUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  function pick(key: string) {
    setSelected(key)
    setParams(key === SECTIONS[0].key ? {} : { tab: key }, { replace: true })
    window.scrollTo(0, 0)
  }
  const current = SECTIONS.find((s) => s.key === selected) ?? SECTIONS[0]

  // «Εκτύπωση / PDF»: render every section (images eager), wait for the images, then
  // open the browser's print dialog — the user picks a printer or «Αποθήκευση ως PDF».
  // Back to the tabbed view when the dialog closes (afterprint).
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    if (!printing) return
    let cancelled = false
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.manual-print img'))
    imgs.forEach((i) => { i.loading = 'eager' }) // lazy ones off-screen would never load
    const pending = imgs.filter((i) => !i.complete).map((i) => new Promise<void>((res) => { i.onload = i.onerror = () => res() }))
    const done = () => setPrinting(false)
    window.addEventListener('afterprint', done)
    Promise.all(pending).then(() => {
      if (cancelled) return
      // Give the browser one frame to lay out the print view before the dialog opens.
      setTimeout(() => window.print(), 50)
    })
    return () => { cancelled = true; window.removeEventListener('afterprint', done) }
  }, [printing])

  if (printing) {
    return (
      <div className="manual manual-print">
        <div className="manual-print-bar">
          Προετοιμασία εκτύπωσης… Στο παράθυρο εκτύπωσης επιλέξτε «Αποθήκευση ως PDF» για αρχείο PDF.{' '}
          <button onClick={() => setPrinting(false)}>Επιστροφή</button>
        </div>
        <h1 className="manual-print-title">Σχέδια ΥΠΕΠΑ — Οδηγίες χρήσης <small>(έκδοση {APP_VERSION})</small></h1>
        {SECTIONS.map((s) => (
          <section key={s.key} className="manual-card manual-print-section">
            <h2 className="manual-print-h2">{s.title}</h2>
            {s.body}
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="manual">
      <div className="manual-head">
        <h2 className="page-title">Οδηγίες χρήσης</h2>
        <button onClick={() => setPrinting(true)} title="Όλες οι οδηγίες σε μία σελίδα για εκτύπωση ή αποθήκευση ως PDF">
          Εκτύπωση / PDF
        </button>
      </div>
      <p className="page-note">
        Πώς λειτουργεί η εφαρμογή: σύνδεση, αναζήτηση, προβολή και επεξεργασία σχεδίων, καταχώριση
        (απλή και μαζική), λίστες επιλογών. Η τελευταία καρτέλα δείχνει την έκδοση και το ιστορικό αλλαγών.
      </p>
      <div className="tabs manual-tabs" role="tablist">
        {SECTIONS.map((s) => (
          <button key={s.key} role="tab" aria-selected={s.key === selected}
                  className={s.key === selected ? 'tab active' : 'tab'} onClick={() => pick(s.key)}>
            {s.title}
          </button>
        ))}
      </div>
      <section className="card manual-card" role="tabpanel">
        {current.body}
      </section>
    </div>
  )
}
