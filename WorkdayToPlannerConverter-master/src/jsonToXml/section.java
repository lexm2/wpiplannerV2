package jsonToXml;

import java.util.ArrayList;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

public class section {
	private ArrayList<period> periods;
	private long crn;
	private String number;   //section number like A01
	private int seats;   //total seats
	private long availableseats;  //available seats
	private int maxWaitlist;
	private long actualWaitlist;
	private String term;  //number code 202201 (term)
	private String partOfTerm;  //"A Term", "B Term", or "A Term, B Term" for semester courses
	private String computedTerm;  //computed academic term letter (A, B, C, D)
	private String note;
	private boolean isGPS;
	private String description;
	private boolean isInterestList;
	
	section(long crn, String number, int seats, long availableseats, int maxWaitlist, long actualWaitlist, String term, String partOfTerm, String description){
		periods = new ArrayList<period>();
		this.crn = crn;
		this.number = number;
		this.seats = seats;
		this.availableseats = availableseats;
		this.maxWaitlist = maxWaitlist;
		this.actualWaitlist = actualWaitlist;
		this.term = term;
		this.partOfTerm = partOfTerm;
		this.description = description;
		this.computedTerm = extractTermLetter(number); // Compute term from section number
	}
	
	section(long crn, String number, int seats, long availableseats, int maxWaitlist, long actualWaitlist, String term, String partOfTerm, String note, String description){
		periods = new ArrayList<period>();
		this.crn = crn;
		this.number = number;
		this.seats = seats;
		this.availableseats = availableseats;
		this.maxWaitlist = maxWaitlist;
		this.actualWaitlist = actualWaitlist;
		this.term = term;
		this.partOfTerm = partOfTerm;
		this.note = note;
		this.description = description;
		this.computedTerm = extractTermLetter(number); // Compute term from section number
	}

	public ArrayList<period> getPeriods() {
		return periods;
	}

	public void setPeriods(ArrayList<period> periods) {
		this.periods = periods;
	}

	public long getCrn() {
		return crn;
	}

	public void setCrn(long crn) {
		this.crn = crn;
	}

	public String getNumber() {
		return number;
	}

	public void setNumber(String number) {
		this.number = number;
	}

	public int getSeats() {
		return seats;
	}

	public void setSeats(int seats) {
		this.seats = seats;
	}

	public long getAvailableseats() {
		return availableseats;
	}

	public void setAvailableseats(long availableseats) {
		this.availableseats = availableseats;
	}

	public int getMaxWaitlist() {
		return maxWaitlist;
	}

	public void setMaxWaitlist(int maxWaitlist) {
		this.maxWaitlist = maxWaitlist;
	}

	public long getActualWaitlist() {
		return actualWaitlist;
	}

	public void setActualWaitlist(long actualWaitlist) {
		this.actualWaitlist = actualWaitlist;
	}

	public String getTerm() {
		return term;
	}

	public void setTerm(String term) {
		this.term = term;
	}

	public String getPartOfTerm() {
		return partOfTerm;
	}

	public void setPartOfTerm(String partOfTerm) {
		this.partOfTerm = partOfTerm;
	}

	public String getNote() {
		return note;
	}

	public void setNote(String note) {
		this.note = note;
	}

	public boolean isGPS() {
		return isGPS;
	}

	public void setGPS(boolean isGPS) {
		this.isGPS = isGPS;
	}

	public String getDescription() {
		return description;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public boolean isInterestList() {
		return isInterestList;
	}

	public void setInterestList(boolean isInterestList) {
		this.isInterestList = isInterestList;
	}
	
	public String getComputedTerm() {
		return computedTerm;
	}
	
	public void setComputedTerm(String computedTerm) {
		this.computedTerm = computedTerm;
	}
	
	/**
	 * Extracts the academic term letter (A, B, C, D) from WPI section data
	 * 
	 * @param sectionNumber - Section number (e.g., "A01", "B02", "DL08/DD08/DX10")
	 * @return Single letter representing the academic term (A, B, C, or D)
	 */
	public static String extractTermLetter(String sectionNumber) {
		if (sectionNumber == null || sectionNumber.isEmpty()) {
			return "A"; // fallback
		}
		
		// Extract term from section numbers like "A01" -> A, "DL08/DD08/DX10" -> D
		Pattern pattern = Pattern.compile("^([ABCD])", Pattern.CASE_INSENSITIVE);
		Matcher matcher = pattern.matcher(sectionNumber);
		
		if (matcher.find()) {
			return matcher.group(1).toUpperCase();
		}
		
		return "A"; // ultimate fallback
	}
	
}
