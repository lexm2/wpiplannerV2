package jsonToXml;

import java.text.SimpleDateFormat;
import java.util.Date;

public class period {
	private String type;  //USE "Lecture", "Lab", or "Conference"
	private String professor;
	private String professorSortName;
	private String professorEmail;
	private boolean monday, tuesday, wednesday, thursday, friday;
	private Date starts; //looks like "10:00AM"
	private Date ends; //looks like "10:50AM"
	private String building; //leave blank
	private String room;
	private int seats;   //total seats
	private long availableseats;  //available seats
	private int maxWaitlist;
	private long actualWaitlist;
	private String specificSection;
	
	period(String type, String professor, boolean monday, boolean tuesday, boolean wednesday, boolean thursday, boolean friday, Date starts, Date ends, String room, int seats, long availableseats, int maxWaitlist, long actualWaitlist, String specificSection){
		this.type = type;
		this.professor = professor;
		this.professorSortName = professor;
		this.professorEmail = "look@it.up";
		this.monday = monday;
		this.tuesday = tuesday;
		this.wednesday = wednesday;
		this.thursday = thursday;
		this.friday = friday;
		this.starts = starts;
		this.ends = ends;
		this.building = "";
		this.room = room;
		this.seats = seats;
		this.availableseats = availableseats;
		this.maxWaitlist = maxWaitlist;
		this.actualWaitlist = actualWaitlist;
		this.specificSection = specificSection;
	}

	public String getType() {
		return type;
	}

	public void setType(String type) {
		this.type = type;
	}

	public String getProfessor() {
		return professor;
	}

	public void setProfessor(String professor) {
		this.professor = professor;
	}

	public String getProfessorSortName() {
		return professorSortName;
	}

	public void setProfessorSortName(String professorSortName) {
		this.professorSortName = professorSortName;
	}

	public String getProfessorEmail() {
		return professorEmail;
	}

	public void setProfessorEmail(String professorEmail) {
		this.professorEmail = professorEmail;
	}


	public boolean isMonday() {
		return monday;
	}

	public void setMonday(boolean monday) {
		this.monday = monday;
	}

	public boolean isTuesday() {
		return tuesday;
	}

	public void setTuesday(boolean tuesday) {
		this.tuesday = tuesday;
	}

	public boolean isWednesday() {
		return wednesday;
	}

	public void setWednesday(boolean wednesday) {
		this.wednesday = wednesday;
	}

	public boolean isThursday() {
		return thursday;
	}

	public void setThursday(boolean thursday) {
		this.thursday = thursday;
	}

	public boolean isFriday() {
		return friday;
	}

	public void setFriday(boolean friday) {
		this.friday = friday;
	}

	public Date getStarts() {
		return starts;
	}

	public void setStarts(Date starts) {
		this.starts = starts;
	}

	public Date getEnds() {
		return ends;
	}

	public void setEnds(Date ends) {
		this.ends = ends;
	}

	public String getBuilding() {
		return building;
	}

	public void setBuilding(String building) {
		this.building = building;
	}

	public String getRoom() {
		return room;
	}

	public void setRoom(String room) {
		this.room = room;
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

	public String getSpecificSection() {
		return specificSection;
	}

	public void setSpecificSection(String specificSection) {
		this.specificSection = specificSection;
	}
	
}
