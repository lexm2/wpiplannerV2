package jsonToXml;

import java.util.ArrayList;

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
	
	
}
